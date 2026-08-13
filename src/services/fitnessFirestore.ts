import type { DocumentChange } from 'firebase/firestore';
import { 
  db, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  collection, 
  deleteDoc, 
  onSnapshot
} from '../lib/firebase';
import { ExerciseDefinition, Workout, SessionLog, AppState } from '../types/fitness';
import { commitBatchOperations } from '../utils/fitnessSyncHelpers';

// ==========================================
// EXERCISE DEFINITIONS FIRESTORE OPERATIONS
// ==========================================

export async function saveExerciseDefinition(uid: string, def: ExerciseDefinition): Promise<void> {
  const ref = doc(db, 'users', uid, 'exerciseDefinitions', def.id);
  await setDoc(ref, def);
}

export async function saveExerciseDefinitionsBatch(uid: string, defs: ExerciseDefinition[]): Promise<void> {
  const colRef = collection(db, 'users', uid, 'exerciseDefinitions');
  await commitBatchOperations<ExerciseDefinition>(defs, (batch, d) => {
    batch.set(doc(colRef, d.id), d);
  });
}

export async function deleteExerciseDefinition(uid: string, id: string): Promise<void> {
  const ref = doc(db, 'users', uid, 'exerciseDefinitions', id);
  await deleteDoc(ref);
}

export async function getExerciseDefinitions(uid: string): Promise<ExerciseDefinition[]> {
  const colRef = collection(db, 'users', uid, 'exerciseDefinitions');
  const snap = await getDocs(colRef);
  return snap.docs.map(d => d.data() as ExerciseDefinition);
}

export function subscribeExerciseDefinitions(
  uid: string,
  onNext: (docChanges: DocumentChange[]) => void,
  onError?: (error: any) => void
): () => void {
  const colRef = collection(db, 'users', uid, 'exerciseDefinitions');
  return onSnapshot(colRef, (snapshot) => {
    onNext(snapshot.docChanges());
  }, onError);
}

// ==========================================
// WORKOUTS FIRESTORE OPERATIONS
// ==========================================

export async function saveWorkout(uid: string, workout: Workout): Promise<void> {
  const ref = doc(db, 'users', uid, 'workouts', workout.id);
  await setDoc(ref, {
    ...workout,
    exercises: workout.exercises || []
  });
}

export async function saveWorkoutsBatch(uid: string, workouts: Workout[]): Promise<void> {
  const colRef = collection(db, 'users', uid, 'workouts');
  await commitBatchOperations<Workout>(workouts, (batch, wo) => {
    batch.set(doc(colRef, wo.id), {
      ...wo,
      exercises: wo.exercises || []
    });
  });
}

export async function deleteWorkout(uid: string, id: string): Promise<void> {
  const ref = doc(db, 'users', uid, 'workouts', id);
  await deleteDoc(ref);
}

export async function getWorkouts(uid: string): Promise<Workout[]> {
  const colRef = collection(db, 'users', uid, 'workouts');
  const snap = await getDocs(colRef);
  return snap.docs.map(d => d.data() as Workout);
}

export function subscribeWorkouts(
  uid: string,
  onNext: (docChanges: DocumentChange[]) => void,
  onError?: (error: any) => void
): () => void {
  const colRef = collection(db, 'users', uid, 'workouts');
  return onSnapshot(colRef, (snapshot) => {
    onNext(snapshot.docChanges());
  }, onError);
}

// ==========================================
// LOGS FIRESTORE OPERATIONS
// ==========================================

export async function saveLog(uid: string, id: string, log: SessionLog): Promise<void> {
  const ref = doc(db, 'users', uid, 'logs', id);
  const { id: _, ...firebaseLog } = log as any;
  await setDoc(ref, firebaseLog);
}

export async function saveLogsBatch(uid: string, logs: Record<string, SessionLog>): Promise<void> {
  const colRef = collection(db, 'users', uid, 'logs');
  const logEntries = Object.entries(logs);
  await commitBatchOperations(logEntries, (batch, [id, val]) => {
    const { id: _, ...firebaseLog } = val as any;
    batch.set(doc(colRef, id), firebaseLog);
  });
}

export async function deleteLog(uid: string, id: string): Promise<void> {
  const ref = doc(db, 'users', uid, 'logs', id);
  await deleteDoc(ref);
}

export async function deleteLogsBatch(uid: string, docIds: string[]): Promise<void> {
  const colRef = collection(db, 'users', uid, 'logs');
  await commitBatchOperations(docIds, (batch, id) => {
    batch.delete(doc(colRef, id));
  });
}

export async function getLogs(uid: string): Promise<Record<string, SessionLog>> {
  const colRef = collection(db, 'users', uid, 'logs');
  const snap = await getDocs(colRef);
  const result: Record<string, SessionLog> = {};
  snap.docs.forEach(d => {
    const raw = d.data() as any;
    result[d.id] = {
      id: d.id,
      workoutId: raw.workoutId,
      date: raw.date,
      sets: raw.sets || {},
      complete: !!raw.complete,
      durationMinutes: Number(raw.durationMinutes !== undefined ? raw.durationMinutes : raw.duration) || 0
    };
  });
  return result;
}

export function subscribeLogs(
  uid: string,
  onNext: (docChanges: DocumentChange[]) => void,
  onError?: (error: any) => void
): () => void {
  const colRef = collection(db, 'users', uid, 'logs');
  return onSnapshot(colRef, (snapshot) => {
    onNext(snapshot.docChanges());
  }, onError);
}

// ==========================================
// APP STATE FIRESTORE OPERATIONS
// ==========================================

export async function saveAppState(uid: string, appState: Partial<AppState>, merge = true): Promise<void> {
  const ref = doc(db, 'users', uid);
  await setDoc(ref, appState, { merge });
}

export async function getAppState(uid: string): Promise<AppState | null> {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as AppState;
}

export function subscribeAppState(
  uid: string,
  onNext: (data: AppState, hasPendingWrites: boolean) => void,
  onError?: (error: any) => void
): () => void {
  const ref = doc(db, 'users', uid);
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      onNext(snap.data() as AppState, snap.metadata.hasPendingWrites);
    }
  }, onError);
}
