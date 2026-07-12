import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  setPersistence, 
  browserLocalPersistence, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  onAuthStateChanged as fbOnAuthStateChanged,
  getRedirectResult as fbGetRedirectResult,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  getFirestore, 
  doc as fbDoc, 
  getDoc as fbGetDoc, 
  getDocFromServer as fbGetDocFromServer,
  setDoc as fbSetDoc,
  getDocs as fbGetDocs,
  collection as fbCollection,
  deleteDoc as fbDeleteDoc,
  onSnapshot as fbOnSnapshot,
  writeBatch as fbWriteBatch
} from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
// @ts-ignore
import firebaseConfig from '../../firebase-applet-config.json';

export type User = FirebaseUser;

// Fallback to environment variables if the config is not set or left as placeholder
const actualConfig = {
  apiKey: (import.meta as any).env.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey,
  authDomain: (import.meta as any).env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain,
  projectId: (import.meta as any).env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId,
  storageBucket: (import.meta as any).env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket,
  messagingSenderId: (import.meta as any).env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfig.messagingSenderId,
  appId: (import.meta as any).env.VITE_FIREBASE_APP_ID || firebaseConfig.appId,
  firestoreDatabaseId: (import.meta as any).env.VITE_FIREBASE_DATABASE_ID || (firebaseConfig as any).firestoreDatabaseId
};

const isFirebaseConfigured = !!actualConfig.apiKey && 
  actualConfig.apiKey.trim() !== "" && 
  !actualConfig.apiKey.includes("YOUR_") && 
  actualConfig.apiKey !== "undefined";

// Real implementation
let dbInstance: any = null;
let authInstance: any = null;
let googleProviderInstance: any = null;
let signInWithGoogleFunc: any = null;

let onAuthStateChangedFunc: any = null;
let getRedirectResultFunc: any = null;
let docFunc: any = null;
let setDocFunc: any = null;
let getDocFunc: any = null;
let getDocsFunc: any = null;
let collectionFunc: any = null;
let deleteDocFunc: any = null;
let onSnapshotFunc: any = null;
let writeBatchFunc: any = null;

if (isFirebaseConfigured) {
  try {
    const app = initializeApp(actualConfig);
    dbInstance = actualConfig.firestoreDatabaseId && actualConfig.firestoreDatabaseId !== "(default)"
      ? getFirestore(app, actualConfig.firestoreDatabaseId) 
      : getFirestore(app);
    authInstance = getAuth(app);

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
    console.error("Failed to initialize real Firebase despite config being present:", e);
    dbInstance = {} as any;
    authInstance = {
      signOut: async () => {},
      currentUser: null
    } as any;
    googleProviderInstance = {} as any;
    signInWithGoogleFunc = async () => {
      alert("Firebase failed to initialize. Check dev logs.");
      return null;
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
} else {
  // Graceful Offline-Only Stubs
  dbInstance = {} as any;
  authInstance = {
    signOut: async () => {},
    currentUser: null
  } as any;
  googleProviderInstance = {} as any;

  signInWithGoogleFunc = async () => {
    alert("Cloud synchronization is disabled. To enable logging in and cloud backups, please complete the Firebase Setup first.");
    return null;
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

// Resilient proxy wrapper to support dynamic dbInstance reassigned in fallback below
// This forwards getPrototypeOf to the active dbInstance so that internal instanceof/brand checks in the Firebase SDK (e.g., inside doc()) succeed.
const dbProxy = new Proxy({}, {
  get(target, prop) {
    if (prop === 'then') return undefined; // Promise check bypass
    const current = dbInstance || target;
    const value = (current as any)[prop];
    if (typeof value === 'function') {
      return value.bind(current);
    }
    return value;
  },
  set(target, prop, value) {
    const current = dbInstance || target;
    (current as any)[prop] = value;
    return true;
  },
  getPrototypeOf(target) {
    const current = dbInstance || target;
    return Reflect.getPrototypeOf(current);
  }
});

export {
  dbProxy as db,
  authInstance as auth,
  googleProviderInstance as googleProvider,
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

// CRITICAL: Connection test and database recovery fallback
async function testConnection() {
  if (!isFirebaseConfigured) {
    console.log("Firebase is not configured. Running in offline-only mode.");
    return;
  }
  try {
    // Attempt to read a dummy document to verify connection on configured database ID
    await fbGetDocFromServer(fbDoc(dbInstance, 'test', 'connection'));
    console.log("Firebase connection established successfully with database:", actualConfig.firestoreDatabaseId || "(default)");
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    const errCode = error?.code || '';
    if (
      errMsg.includes('not found') || 
      errMsg.includes('database') || 
      errMsg.includes('INVALID_ARGUMENT') || 
      errCode === 'not-found' || 
      errCode === 'invalid-argument'
    ) {
      console.warn("Custom firestore database not found. Falling back to default database (default). Error:", errMsg);
      try {
        const app = initializeApp(actualConfig);
        dbInstance = getFirestore(app);
        // Test default connection
        await fbGetDocFromServer(fbDoc(dbInstance, 'test', 'connection'));
        console.log("Firebase connection established with default database.");
      } catch (fallbackError) {
        console.error("Failed to connect to default database fallback:", fallbackError);
      }
    } else if (errMsg.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. The client appears to be offline.");
    } else {
      console.log("Firebase connection established.");
    }
  }
}
testConnection();
