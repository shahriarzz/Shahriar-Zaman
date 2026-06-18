import React, { createContext, useContext, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TriangleAlert, HelpCircle } from 'lucide-react';

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

  const confirm = (opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setOptions(opts);
      setIsOpen(true);
      resolveRef.current = resolve;
    });
  };

  const handleClose = (value: boolean) => {
    if (resolveRef.current) {
      resolveRef.current(value);
      resolveRef.current = null;
    }
    setIsOpen(false);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <AnimatePresence>
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
                  <h2 className={`text-base font-sans font-semibold tracking-tight ${options.isDanger ? 'text-red-400' : 'text-zinc-100'}`}>
                    {options.title}
                  </h2>
                  <div className="text-xs text-zinc-400 font-mono leading-relaxed uppercase tracking-wider whitespace-pre-wrap">
                    {options.message}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-8 flex items-center justify-end gap-3 font-mono text-[10px] tracking-widest uppercase">
                <button
                  type="button"
                  onClick={() => handleClose(false)}
                  className="px-5 py-3 border border-zinc-850 hover:bg-zinc-900 rounded-xl text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer"
                >
                  ABORT
                </button>
                <button
                  type="button"
                  onClick={() => handleClose(true)}
                  className={`px-5 py-3 rounded-xl hover:shadow-lg transition-all cursor-pointer ${
                    options.isDanger 
                      ? 'bg-red-500/10 hover:bg-red-500 border border-red-500/30 text-red-500 hover:text-black' 
                      : 'bg-orange-500/10 hover:bg-orange-500 border border-orange-500/30 text-orange-500 hover:text-black'
                  }`}
                >
                  EXECUTE
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
};
