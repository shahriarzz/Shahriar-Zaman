import React, { createContext, useContext, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TriangleAlert, HelpCircle } from 'lucide-react';
import { Button } from '../components/ui';

interface ConfirmOptions {
  title: string;
  message: string;
  isDanger?: boolean;
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context;
};

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  
  // Keep resolve fn in a ref to persist across renders
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  // Unmount safety: resolve pending promise on unmount
  React.useEffect(() => {
    return () => {
      if (resolveRef.current) {
        resolveRef.current(false);
        resolveRef.current = null;
      }
    };
  }, []);

  // Lock background scroll when the confirm dialog is active
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Escape and Enter key support to dismiss/confirm the dialog safely
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleClose(true);
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const abortButtonRef = useRef<HTMLButtonElement | null>(null);

  // Focus the default ABORT option on mount for accessibility
  React.useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        abortButtonRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const confirm = React.useCallback((opts: ConfirmOptions): Promise<boolean> => {
    if (resolveRef.current) {
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      setOptions(opts);
      setIsOpen(true);
      resolveRef.current = resolve;
    });
  }, []);

  const handleClose = (value: boolean) => {
    if (resolveRef.current) {
      resolveRef.current(value);
      resolveRef.current = null;
    }
    setIsOpen(false);
  };

  const contextValue = React.useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={contextValue}>
      {children}
      <AnimatePresence onExitComplete={() => { if (!isOpen) setOptions(null); }}>
        {isOpen && options && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => handleClose(false)}
              className="absolute inset-0 bg-[#040409]/80 backdrop-blur-md"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-dialog-title"
              aria-describedby="confirm-dialog-description"
              className="relative w-full max-w-md bg-[#0e0e15] border border-zinc-800/80 rounded-3xl p-6 text-zinc-200 shadow-2xl focus:outline-none"
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-2xl flex-shrink-0 ${
                  options.isDanger ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-orange-500/10 text-orange-500 border border-orange-500/20'
                }`}>
                  {options.isDanger ? <TriangleAlert size={20} /> : <HelpCircle size={20} />}
                </div>

                <div className="flex-1 space-y-2">
                  <h3 className="text-sm font-mono text-[11px] uppercase tracking-[0.2em] font-bold text-zinc-400">
                    System Protocol
                  </h3>
                  <h2 id="confirm-dialog-title" className={`text-base font-sans font-semibold tracking-tight ${options.isDanger ? 'text-red-400' : 'text-zinc-100'}`}>
                    {options.title}
                  </h2>
                  <div id="confirm-dialog-description" className="text-xs text-zinc-400 font-mono leading-relaxed uppercase tracking-wider whitespace-pre-wrap">
                    {options.message}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-8 flex items-center justify-end gap-3 font-mono text-[10px] tracking-widest uppercase">
                <Button
                  ref={abortButtonRef}
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => handleClose(false)}
                >
                  ABORT
                </Button>
                <Button
                  type="button"
                  variant={options.isDanger ? "destructive" : "primary"}
                  color={options.isDanger ? "red" : "orange"}
                  size="md"
                  onClick={() => handleClose(true)}
                >
                  EXECUTE
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
};
