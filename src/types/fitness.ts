export type WorkoutType = 'push' | 'pull' | 'hybrid' | 'rest' | 'date' | 'upper' | 'lower' | 'custom';

export interface ExerciseDefinition {
  id: string;
  name: string;
  target: string;
  equipment?: string;
  instructions?: string;
  tags?: string[];
}

export interface WorkoutExercise {
  exerciseDefinitionId: string;
  sets: number;
  reps: string;
  rest?: string;
  note?: string;
  tags?: string[];
}

// Helper alias for components building combined display objects from ExerciseDefinition + WorkoutExercise
export type Exercise = ExerciseDefinition & WorkoutExercise & { id: string };

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
  exercises: WorkoutExercise[];
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
  sets: Record<string, SetLog[]>; // exerciseDefinitionId -> sets
  complete: boolean;
  durationMinutes: number; // minutes
}

export interface AppState {
  cycleStart: string; // YYYY-MM-DD
  weightLog?: Record<string, number>; // date -> kg
}

export const CURRENT_SCHEMA_VERSION = 2;

export interface FitnessDatabase {
  schemaVersion: number;
  exerciseDefinitions: ExerciseDefinition[];
  workouts: Workout[];
  logs: Record<string, SessionLog>;
  appState: AppState;
}
