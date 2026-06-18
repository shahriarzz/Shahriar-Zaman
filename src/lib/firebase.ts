import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, GoogleAuthProvider, signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import firebaseConfig from '../../firebase-applet-config.json';

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

const app = initializeApp(actualConfig);
export const db = actualConfig.firestoreDatabaseId && actualConfig.firestoreDatabaseId !== "(default)"
  ? getFirestore(app, actualConfig.firestoreDatabaseId) 
  : getFirestore(app);
export const auth = getAuth(app);

// Configure local persistence to survive user app restarts
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Failed to enable browser local persistence on Firebase Auth:", err);
});

export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  try {
    if (Capacitor.isNativePlatform()) {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    if (error?.code === 'auth/popup-closed-by-user') return null;
    console.error("Sign-in failed:", error);
    throw error;
  }
};

// CRITICAL: Connection test
async function testConnection() {
  try {
    // Attempt to read a dummy document to verify connection
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. The client appears to be offline.");
    } else {
      // It's expected to fail with permission denied if no such doc exists and rules are strict
      console.log("Firebase connection established.");
    }
  }
}
testConnection();
