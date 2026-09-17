import React, { createContext, useContext, useState, useRef } from 'react';
import { TriangleAlert, HelpCircle } from 'lucide-react';
import { Button, Dialog, DialogHeader, DialogFooter } from '../components/ui';

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

  // Enter key support to confirm the dialog safely (Escape handled by Dialog)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
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
      <Dialog
        isOpen={isOpen && Boolean(options)}
        onClose={() => handleClose(false)}
        size="md"
      >
        {options && (
          <>
            <DialogHeader
              eyebrow="System Protocol"
              title={options.title}
              description={options.message}
              isDanger={options.isDanger}
              icon={
                options.isDanger ? (
                  <TriangleAlert size={20} />
                ) : (
                  <HelpCircle size={20} />
                )
              }
            />

            {/* Action Buttons */}
            <DialogFooter>
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
            </DialogFooter>
          </>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
};
