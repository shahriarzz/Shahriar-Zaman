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
  code?: string;
  operationType: OperationType;
  path: string | null;
}

let toastTimeoutId: any = null;
let lastToastTime = 0;

function showCloudSyncToast(msg: string) {
  if (typeof document === 'undefined') return;
  
  // Throttle / deduplicate if multiple writes fail in quick succession (3 seconds)
  const now = Date.now();
  if (now - lastToastTime < 3000) {
    return;
  }
  lastToastTime = now;
  
  let container = document.getElementById('gl-sync-error-toast');
  if (!container) {
    container = document.createElement('div');
    container.id = 'gl-sync-error-toast';
    container.className = 'fixed bottom-24 right-4 md:top-4 md:bottom-auto md:right-4 z-50 flex items-center gap-2.5 bg-red-950/90 hover:bg-red-950 border border-red-500/30 text-red-200 px-4.5 py-3 rounded-2xl shadow-2xl backdrop-blur-xl transition-all duration-300 transform translate-y-2 opacity-0 font-mono text-[9px] uppercase tracking-widest leading-none pointer-events-none select-none';
    document.body.appendChild(container);
  }
  
  // Clear the container
  container.innerHTML = '';
  
  // Build safe visual components
  const pingDot = document.createElement('span');
  pingDot.className = 'w-1.5 h-1.5 rounded-full bg-red-500 animate-ping shrink-0';
  
  const textSpan = document.createElement('span');
  textSpan.textContent = `Cloud Sync Alert: ${msg}`;
  
  container.appendChild(pingDot);
  container.appendChild(textSpan);

  // Trigger entering transition
  setTimeout(() => {
    container?.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  // Clear existing timeout and auto-hide
  if (toastTimeoutId) {
    clearTimeout(toastTimeoutId);
  }
  
  toastTimeoutId = setTimeout(() => {
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
  const errCode = (error as any)?.code;
  
  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    code: errCode,
    operationType,
    path
  };
  
  const isOffline = (typeof navigator !== 'undefined' && !navigator.onLine) || 
                    errCode === 'unavailable' || 
                    errMessage.toLowerCase().includes('offline') || 
                    errMessage.includes('Failed to get document');

  // Clean logging to production console (excluding noisy or sensitive auth credentials)
  if (isOffline) {
    console.log('Firestore (offline):', JSON.stringify(errInfo));
  } else {
    console.error('Firestore Error:', JSON.stringify(errInfo));
  }

  // Visual user-facing notification for write operations to provide clean UX
  if (operationType === OperationType.CREATE || 
      operationType === OperationType.UPDATE || 
      operationType === OperationType.DELETE || 
      operationType === OperationType.WRITE) {
    
    let briefError = 'Working Offline';
    
    if (errCode === 'permission-denied') {
      briefError = 'Permission Denied';
    } else if (errCode === 'unauthenticated') {
      briefError = 'Unauthenticated';
    } else if (errCode === 'deadline-exceeded') {
      briefError = 'Timeout';
    } else if (errCode === 'unavailable') {
      briefError = 'Working Offline';
    } else {
      // Robust fallback check in case code is not provided by the SDK error instance
      if (errMessage.includes('insufficient permissions') || errMessage.includes('permission-denied')) {
        briefError = 'Permission Denied';
      }
    }
    
    showCloudSyncToast(briefError);
  }
}
