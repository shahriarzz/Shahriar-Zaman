import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  setPersistence, 
  browserLocalPersistence, 
  connectAuthEmulator,
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  onAuthStateChanged as fbOnAuthStateChanged,
  getRedirectResult as fbGetRedirectResult,
  User as FirebaseUser,
  Auth
} from 'firebase/auth';
import { 
  getFirestore,
  initializeFirestore,
  connectFirestoreEmulator,
  setLogLevel,
  doc as fbDoc, 
  getDoc as fbGetDoc, 
  getDocFromServer as fbGetDocFromServer,
  setDoc as fbSetDoc,
  getDocs as fbGetDocs,
  collection as fbCollection,
  deleteDoc as fbDeleteDoc,
  onSnapshot as fbOnSnapshot,
  writeBatch as fbWriteBatch,
  Firestore
} from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { logger } from '../utils/logger';
// Safely check for firebase-applet-config.json without triggering static module resolution errors if file is deleted
const configModules = (import.meta as any).glob(['/firebase-applet-config.json', '../../firebase-applet-config.json'], { eager: true }) as Record<string, any>;
const rawConfig = configModules['/firebase-applet-config.json']?.default 
  || configModules['../../firebase-applet-config.json']?.default 
  || Object.values(configModules)[0]?.default 
  || {};
const firebaseConfig = rawConfig;

export type User = FirebaseUser;

const metaEnv = ((import.meta as any).env || {}) as Record<string, any>;
const procEnv = typeof process !== 'undefined' && process.env ? (process.env as Record<string, any>) : {};
const env: Record<string, any> = {
  DEV: metaEnv.DEV,
  VITE_FIREBASE_USE_EMULATOR: metaEnv.VITE_FIREBASE_USE_EMULATOR ?? procEnv.VITE_FIREBASE_USE_EMULATOR,
  VITE_FIREBASE_API_KEY: metaEnv.VITE_FIREBASE_API_KEY ?? procEnv.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: metaEnv.VITE_FIREBASE_AUTH_DOMAIN ?? procEnv.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: metaEnv.VITE_FIREBASE_PROJECT_ID ?? procEnv.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: metaEnv.VITE_FIREBASE_STORAGE_BUCKET ?? procEnv.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID ?? procEnv.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: metaEnv.VITE_FIREBASE_APP_ID ?? procEnv.VITE_FIREBASE_APP_ID,
  VITE_FIREBASE_DATABASE_ID: metaEnv.VITE_FIREBASE_DATABASE_ID ?? procEnv.VITE_FIREBASE_DATABASE_ID,
  VITE_FIREBASE_AUTH_EMULATOR_HOST: metaEnv.VITE_FIREBASE_AUTH_EMULATOR_HOST ?? procEnv.VITE_FIREBASE_AUTH_EMULATOR_HOST,
  VITE_FIREBASE_FIRESTORE_EMULATOR_HOST: metaEnv.VITE_FIREBASE_FIRESTORE_EMULATOR_HOST ?? procEnv.VITE_FIREBASE_FIRESTORE_EMULATOR_HOST,
};
export const isFirebaseEmulatorEnabled = env.VITE_FIREBASE_USE_EMULATOR === 'true';

const isValidConfigField = (val: unknown): boolean =>
  typeof val === 'string' &&
  val.trim() !== '' &&
  !val.includes('YOUR_') &&
  val !== 'undefined';

function parseLocalEmulatorHostPort(rawHostPort: unknown, fallbackHost: string, fallbackPort: number, label: string): { host: string; port: number } {
  const raw = typeof rawHostPort === 'string' && rawHostPort.trim() ? rawHostPort.trim() : `${fallbackHost}:${fallbackPort}`;
  const parts = raw.split(':');
  if (parts.length !== 2) {
    throw new Error(`[Firebase Integration Config Error] Invalid ${label} "${raw}". Expected host:port.`);
  }
  const [host, portStr] = parts;
  const port = Number(portStr);
  if ((host !== '127.0.0.1' && host !== 'localhost') || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`[Firebase Integration Config Error] Unsafe or invalid ${label} "${raw}". Must target localhost or 127.0.0.1.`);
  }
  return { host, port };
}

// In emulator integration mode, read exclusively from VITE_FIREBASE_* so local/prod applet configs never leak into tests
const actualConfig = isFirebaseEmulatorEnabled
  ? {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
      appId: env.VITE_FIREBASE_APP_ID,
      firestoreDatabaseId: env.VITE_FIREBASE_DATABASE_ID
    }
  : {
      apiKey: env.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain,
      projectId: env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfig.messagingSenderId,
      appId: env.VITE_FIREBASE_APP_ID || firebaseConfig.appId,
      firestoreDatabaseId: env.VITE_FIREBASE_DATABASE_ID || (firebaseConfig as any).firestoreDatabaseId
    };

export type FirebaseConfigState = 'configured' | 'incomplete' | 'offline_by_default';

/**
 * Validates the required Firebase fields according to services consumed (Auth with Google & Firestore).
 * Strictly checks apiKey, projectId, appId, and authDomain for complete authentication setup.
 */
export function computeFirebaseConfigState(config: Record<string, any>): FirebaseConfigState {
  const hasApiKey = isValidConfigField(config.apiKey);
  const hasProjectId = isValidConfigField(config.projectId);
  const hasAppId = isValidConfigField(config.appId);
  const hasAuthDomain = isValidConfigField(config.authDomain);

  const isFullyConfigured = hasApiKey && hasProjectId && hasAppId && hasAuthDomain;
  if (isFullyConfigured) return 'configured';

  const hasAnyField = hasApiKey || hasProjectId || hasAppId || hasAuthDomain ||
    isValidConfigField(config.storageBucket) || isValidConfigField(config.messagingSenderId);
  if (hasAnyField) return 'incomplete';

  return 'offline_by_default';
}

const firebaseConfigState: FirebaseConfigState = computeFirebaseConfigState(actualConfig);
const isFirebaseConfigured = firebaseConfigState === 'configured';

if (isFirebaseEmulatorEnabled) {
  if (!isFirebaseConfigured) {
    throw new Error(
      '[Firebase Integration Config Error] Emulator mode requested (VITE_FIREBASE_USE_EMULATOR=true), ' +
      'but required Firebase configuration fields (apiKey, authDomain, projectId, appId) are incomplete.'
    );
  }
  if (typeof actualConfig.projectId !== 'string' || !/^demo-[a-z0-9-]+$/i.test(actualConfig.projectId)) {
    throw new Error(
      `[Firebase Integration Config Error] Unsafe projectId "${String(actualConfig.projectId)}". ` +
      'Integration mode must target a dedicated demo-* project ID (e.g. "demo-gainlog").'
    );
  }
  if (actualConfig.firestoreDatabaseId && actualConfig.firestoreDatabaseId !== '(default)') {
    throw new Error(
      `[Firebase Integration Config Error] Unsupported custom firestoreDatabaseId "${actualConfig.firestoreDatabaseId}" in emulator mode.`
    );
  }
}

// Real implementation variables typed fully
let dbInstance: Firestore;
let authInstance: Auth;
let googleProviderInstance: GoogleAuthProvider;
let signInWithGoogleFunc: () => Promise<User | null>;

let onAuthStateChangedFunc: typeof fbOnAuthStateChanged;
let getRedirectResultFunc: typeof fbGetRedirectResult;
let docFunc: typeof fbDoc;
let setDocFunc: typeof fbSetDoc;
let getDocFunc: typeof fbGetDoc;
let getDocsFunc: typeof fbGetDocs;
let collectionFunc: typeof fbCollection;
let deleteDocFunc: typeof fbDeleteDoc;
let onSnapshotFunc: typeof fbOnSnapshot;
let writeBatchFunc: typeof fbWriteBatch;

// Reusable function to create and apply offline/fallback stubs to avoid code drift
function applyOfflineStubs() {
  dbInstance = {} as any;
  authInstance = {
    signOut: async () => {},
    currentUser: null
  } as any;
  googleProviderInstance = {} as any;

  signInWithGoogleFunc = async () => {
    const error = new Error("Cloud synchronization is disabled. To enable logging in and cloud backups, please complete the Firebase Setup first.");
    (error as any).code = 'auth/not-configured';
    throw error;
  };

  onAuthStateChangedFunc = ((_auth: any, callback: (user: any) => void) => {
    setTimeout(() => callback(null), 0);
    return () => {};
  }) as any;

  getRedirectResultFunc = (async () => null) as any;
  docFunc = (() => ({} as any)) as any;
  setDocFunc = (async () => {}) as any;
  getDocFunc = (async () => ({} as any)) as any;
  getDocsFunc = (async () => ({ docs: [] } as any)) as any;
  collectionFunc = (() => ({} as any)) as any;
  deleteDocFunc = (async () => {}) as any;
  onSnapshotFunc = (() => () => {}) as any;
  writeBatchFunc = (() => ({
    set: () => {},
    delete: () => {},
    commit: async () => {}
  } as any)) as any;
}

if (isFirebaseConfigured) {
  try {
    // Suppress non-fatal Firestore internal WebChannel connection retry spam
    try {
      setLogLevel('error');
    } catch {
      // Ignored if not supported
    }

    // Guard initializeApp against double-initialization
    const app = getApps().length > 0 ? getApp() : initializeApp(actualConfig);
    
    const dbSettings = {
      experimentalAutoDetectLongPolling: true,
      ignoreUndefinedProperties: true
    };

    try {
      dbInstance = actualConfig.firestoreDatabaseId && actualConfig.firestoreDatabaseId !== "(default)"
        ? initializeFirestore(app, dbSettings, actualConfig.firestoreDatabaseId)
        : initializeFirestore(app, dbSettings);
    } catch {
      dbInstance = actualConfig.firestoreDatabaseId && actualConfig.firestoreDatabaseId !== "(default)"
        ? getFirestore(app, actualConfig.firestoreDatabaseId) 
        : getFirestore(app);
    }

    authInstance = getAuth(app);

    if (isFirebaseEmulatorEnabled) {
      const authEp = parseLocalEmulatorHostPort(
        env.VITE_FIREBASE_AUTH_EMULATOR_HOST,
        '127.0.0.1',
        9099,
        'VITE_FIREBASE_AUTH_EMULATOR_HOST'
      );
      const fsEp = parseLocalEmulatorHostPort(
        env.VITE_FIREBASE_FIRESTORE_EMULATOR_HOST,
        '127.0.0.1',
        8080,
        'VITE_FIREBASE_FIRESTORE_EMULATOR_HOST'
      );
      if (!(dbInstance as any)._settingsFrozen) {
        connectFirestoreEmulator(dbInstance, fsEp.host, fsEp.port);
      }
      if (!(authInstance as any).emulatorConfig) {
        connectAuthEmulator(authInstance, `http://${authEp.host}:${authEp.port}`, { disableWarnings: true });
      }
    }

    // Configure local persistence to survive user app restarts
    setPersistence(authInstance, browserLocalPersistence).catch((err) => {
      console.error("Failed to enable browser local persistence on Firebase Auth:", err);
    });

    googleProviderInstance = new GoogleAuthProvider();

    signInWithGoogleFunc = async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          await signInWithRedirect(authInstance, googleProviderInstance);
          return null;
        }
        const result = await signInWithPopup(authInstance, googleProviderInstance);
        return result.user;
      } catch (error: any) {
        if (error?.code === 'auth/popup-closed-by-user') return null;
        
        // Handle common Google Sign-In error codes gracefully
        if (error?.code === 'auth/popup-blocked') {
          const friendlyErr = new Error("The Google Sign-In popup was blocked by your browser. Please allow popups or open the app in a New Tab to login.");
          (friendlyErr as any).code = error.code;
          throw friendlyErr;
        }
        if (error?.code === 'auth/network-request-failed') {
          const friendlyErr = new Error("Network request failed. Please check your internet connection and try again.");
          (friendlyErr as any).code = error.code;
          throw friendlyErr;
        }
        if (error?.code === 'auth/operation-not-allowed') {
          const friendlyErr = new Error("Google Sign-In is not enabled in your Firebase Console. Please enable Google provider under Authentication -> Sign-in method.");
          (friendlyErr as any).code = error.code;
          throw friendlyErr;
        }
        
        console.error("Sign-in failed:", error);
        throw error;
      }
    };

    onAuthStateChangedFunc = fbOnAuthStateChanged;
    getRedirectResultFunc = fbGetRedirectResult;
    docFunc = fbDoc;
    setDocFunc = fbSetDoc;
    getDocFunc = fbGetDoc;
    getDocsFunc = fbGetDocs;
    collectionFunc = fbCollection;
    deleteDocFunc = fbDeleteDoc;
    onSnapshotFunc = fbOnSnapshot;
    writeBatchFunc = fbWriteBatch;

  } catch (e) {
    if (isFirebaseEmulatorEnabled) {
      throw e;
    }
    console.error("Failed to initialize real Firebase despite config being present:", e);
    applyOfflineStubs();
  }
} else {
  applyOfflineStubs();
}

export {
  dbInstance as db,
  authInstance as auth,
  signInWithGoogleFunc as signInWithGoogle,
  onAuthStateChangedFunc as onAuthStateChanged,
  getRedirectResultFunc as getRedirectResult,
  docFunc as doc,
  setDocFunc as setDoc,
  getDocFunc as getDoc,
  getDocsFunc as getDocs,
  collectionFunc as collection,
  deleteDocFunc as deleteDoc,
  onSnapshotFunc as onSnapshot,
  writeBatchFunc as writeBatch
};

// Connection test - dev only to prevent unnecessary network calls in production
async function testConnection() {
  if (firebaseConfigState === 'incomplete') {
    logger.warn("Firebase configuration is incomplete. Running in offline fallback mode.");
    return;
  }
  if (!isFirebaseConfigured) {
    logger.debug("Firebase is not configured. Running in offline-only mode.");
    return;
  }
  try {
    // Attempt to read a dummy document to verify connection on configured database ID
    await fbGetDocFromServer(fbDoc(dbInstance, 'test', 'connection'));
    logger.debug("Firebase connection established successfully with database:", actualConfig.firestoreDatabaseId || "(default)");
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    const errCode = error?.code || '';
    const isOffline = (typeof navigator !== 'undefined' && !navigator.onLine) || 
                      errCode === 'unavailable' || 
                      errMsg.toLowerCase().includes('offline') || 
                      errMsg.includes('Failed to get document');

    if (
      errMsg.includes('not found') || 
      errMsg.includes('database') || 
      errMsg.includes('INVALID_ARGUMENT') || 
      errCode === 'not-found' || 
      errCode === 'invalid-argument'
    ) {
      console.error(
        `[CRITICAL] Custom Firestore database ID "${actualConfig.firestoreDatabaseId}" could not be reached. ` +
        `Please ensure this database exists in your Firebase console or matches the active project ID. ` +
        `Error: ${errMsg}`
      );
    } else if (isOffline) {
      logger.debug("Firebase is offline. Operating in offline cache mode.");
    } else {
      logger.debug("Firebase connection established.");
    }
  }
}

if (env.DEV && !isFirebaseEmulatorEnabled) {
  testConnection();
}
