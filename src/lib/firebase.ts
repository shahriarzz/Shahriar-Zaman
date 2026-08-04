import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  setPersistence, 
  browserLocalPersistence, 
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
// Safely check for firebase-applet-config.json without triggering static module resolution errors if file is deleted
const configModules = (import.meta as any).glob(['/firebase-applet-config.json', '../../firebase-applet-config.json'], { eager: true }) as Record<string, any>;
const rawConfig = configModules['/firebase-applet-config.json']?.default 
  || configModules['../../firebase-applet-config.json']?.default 
  || Object.values(configModules)[0]?.default 
  || {};
const firebaseConfig = rawConfig;

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
    // Guard initializeApp against double-initialization
    const app = getApps().length > 0 ? getApp() : initializeApp(actualConfig);
    
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
    console.error("Failed to initialize real Firebase despite config being present:", e);
    applyOfflineStubs();
  }
} else {
  applyOfflineStubs();
}

export {
  dbInstance as db,
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
  writeBatchFunc as writeBatch,
  isFirebaseConfigured
};

// Connection test - dev only to prevent unnecessary network calls in production
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
      console.log("Firebase is offline. Operating in offline cache mode.");
    } else {
      console.log("Firebase connection established.");
    }
  }
}

if ((import.meta as any).env.DEV) {
  testConnection();
}
