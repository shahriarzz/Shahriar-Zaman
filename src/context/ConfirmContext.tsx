import React, { createContext, useContext, useRef, useReducer, useEffect, useCallback, useMemo } from 'react';
import { TriangleAlert, HelpCircle } from 'lucide-react';
import { Button, Dialog, DialogHeader, DialogFooter } from '../components/ui';
import {
  initialConfirmationState,
  confirmationTransition,
  ConfirmationRequest
} from '../state/dialogs/confirmationMachine';

export interface ConfirmOptions {
  title: string;
  message: string;
  isDanger?: boolean;
  confirmText?: string;
  cancelText?: string;
}

export interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

export const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context;
};

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [confirmState, dispatch] = useReducer(confirmationTransition, initialConfirmationState);
  
  // Map of requestId -> resolve function
  const resolversRef = useRef<Map<string, (val: boolean) => void>>(new Map());
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // Unmount safety: resolve all pending promises on unmount with false
  useEffect(() => {
    return () => {
      resolversRef.current.forEach(resolve => resolve(false));
      resolversRef.current.clear();
      dispatch({ type: 'RESET' });
    };
  }, []);

  const activeRequest = confirmState.status === 'open' ? confirmState.active : null;
  const isOpen = Boolean(activeRequest);

  const handleClose = useCallback((value: boolean) => {
    if (!activeRequest) return;
    const resolver = resolversRef.current.get(activeRequest.id);
    if (!resolver) return;
    resolversRef.current.delete(activeRequest.id);
    resolver(value);
    dispatch({ type: 'RESOLVE', requestId: activeRequest.id });

    // Restore focus to the element that triggered the confirmation
    if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
      try {
        previousActiveElementRef.current.focus();
      } catch {}
      previousActiveElementRef.current = null;
    }
  }, [activeRequest]);

  // Escape key support to safely cancel the active dialog
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleClose]);

  const abortButtonRef = useRef<HTMLButtonElement | null>(null);

  // Capture activeElement and focus default ABORT button on open for accessibility and keyboard safety
  useEffect(() => {
    if (isOpen) {
      if (document.activeElement instanceof HTMLElement) {
        previousActiveElementRef.current = document.activeElement;
      }
      const timer = setTimeout(() => {
        abortButtonRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, activeRequest?.id]);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    const id = `confirm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const request: ConfirmationRequest = {
      id,
      title: opts.title,
      message: opts.message,
      isDanger: opts.isDanger,
      confirmText: opts.confirmText,
      cancelText: opts.cancelText
    };

    return new Promise((resolve) => {
      resolversRef.current.set(id, resolve);
      dispatch({ type: 'ENQUEUE', request });
    });
  }, []);

  const contextValue = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={contextValue}>
      {children}
      <Dialog
        isOpen={isOpen && Boolean(activeRequest)}
        onClose={() => handleClose(false)}
        size="md"
        ariaLabel={activeRequest?.title || 'System Protocol Confirmation'}
      >
        {activeRequest && (
          <>
            <DialogHeader
              eyebrow="System Protocol"
              title={activeRequest.title}
              description={activeRequest.message}
              isDanger={activeRequest.isDanger}
              icon={
                activeRequest.isDanger ? (
                  <TriangleAlert size={20} />
                ) : (
                  <HelpCircle size={20} />
                )
              }
            />

            {/* Action Buttons: focused control activates on Enter via standard HTML button semantics */}
            <DialogFooter>
              <Button
                ref={abortButtonRef}
                type="button"
                variant="outline"
                size="md"
                onClick={() => handleClose(false)}
              >
                {activeRequest.cancelText || 'ABORT'}
              </Button>
              <Button
                type="button"
                variant={activeRequest.isDanger ? "destructive" : "primary"}
                color={activeRequest.isDanger ? "red" : "orange"}
                size="md"
                onClick={() => handleClose(true)}
              >
                {activeRequest.confirmText || 'EXECUTE'}
              </Button>
            </DialogFooter>
          </>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
};
