import { auth } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
    }[];
  }
}

function showSyncErrorToast(msg: string) {
  if (typeof document === 'undefined') return;
  
  let container = document.getElementById('gl-sync-error-toast');
  if (!container) {
    container = document.createElement('div');
    container.id = 'gl-sync-error-toast';
    container.className = 'fixed bottom-24 right-4 md:top-4 md:bottom-auto md:right-4 z-50 flex items-center gap-2.5 bg-red-950/90 hover:bg-red-950 border border-red-500/30 text-red-200 px-4.5 py-3 rounded-2xl shadow-2xl backdrop-blur-xl transition-all duration-300 transform translate-y-2 opacity-0 font-mono text-[9px] uppercase tracking-widest leading-none pointer-events-none select-none';
    document.body.appendChild(container);
  }
  
  container.innerHTML = `
    <span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span>
    <span>Cloud Sync Alert: ${msg}</span>
  `;

  // Trigger transition
  setTimeout(() => {
    container?.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  // Auto-hide after 5 seconds
  const currentContainer = container as any;
  if (currentContainer._timeout) {
    clearTimeout(currentContainer._timeout);
  }
  
  currentContainer._timeout = setTimeout(() => {
    container?.classList.add('translate-y-2', 'opacity-0');
    setTimeout(() => {
      if (container?.parentNode) {
        container.parentNode.removeChild(container);
      }
    }, 300);
  }, 5000);
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  
  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId
      })) || []
    },
    operationType,
    path
  };
  
  // Log stripped diagnostic error for privacy
  console.error('Firestore Error: ', JSON.stringify(errInfo));

  // Visual user-facing notification for writing operations to provide clear UX
  if (operationType === OperationType.CREATE || 
      operationType === OperationType.UPDATE || 
      operationType === OperationType.DELETE || 
      operationType === OperationType.WRITE) {
    const briefError = errMessage.includes('insufficient permissions') 
      ? 'Permission Denied' 
      : 'Network Interrupted (Working Offline)';
    showSyncErrorToast(briefError);
  }
}
