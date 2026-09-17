import { showToast } from '../components/ui';

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

let lastToastTime = 0;

function showCloudSyncToast(msg: string) {
  // Throttle / deduplicate if multiple writes fail in quick succession (3 seconds)
  const now = Date.now();
  if (now - lastToastTime < 3000) {
    return;
  }
  lastToastTime = now;

  showToast({
    message: `Cloud Sync: ${msg}`,
    tone: 'error',
    duration: 5000,
  });
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
