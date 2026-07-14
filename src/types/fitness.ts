export type WorkoutType = 'push' | 'pull' | 'hybrid' | 'rest' | 'date' | 'upper' | 'lower' | 'custom';

export interface Exercise {
  id: string;
  name: string;
  target: string;
  sets: number;
  reps: string;
  note?: string;
  tags?: string[];
}

export interface CardioFinisher {
  name: string;
  detail: string;
  duration: string;
}

export interface Workout {
  id: string;
  name: string;
  badge: string;
  type: WorkoutType;
  exercises: Exercise[];
  cardio?: CardioFinisher | null;
  cycleDay?: number | null;
  isCore?: boolean;
  restNotes?: string[];
}

export interface SetLog {
  id: string;
  weight: string;
  reps: string;
  done: boolean;
}

export interface SessionLog {
  id: string;
  workoutId: string;
  date: string; // YYYY-MM-DD
  sets: Record<string, SetLog[]>; // exerciseId -> sets
  complete: boolean;
  durationMinutes: number; // minutes
}

export interface AppState {
  cycleStart: string; // YYYY-MM-DD
  weightLog?: Record<string, number>; // date -> kg
}
