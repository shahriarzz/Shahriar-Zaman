export type DraftState = 'clean' | 'dirty' | 'saving' | 'saved' | 'save_failed';

export type EditorMode =
  | { readonly view: 'manage' }
  | { readonly view: 'program_editor'; readonly workoutId: string; readonly draftState: DraftState; readonly pendingExit?: boolean }
  | { readonly view: 'workout_editor'; readonly workoutId: string; readonly draftState: DraftState; readonly pendingExit?: boolean }
  | { readonly view: 'exercise_editor'; readonly exerciseDefId?: string; readonly isNew: boolean; readonly draftState: DraftState; readonly pendingExit?: boolean };

export type EditorEvent =
  | { readonly type: 'OPEN_PROGRAM_EDITOR'; readonly workoutId: string }
  | { readonly type: 'OPEN_WORKOUT_EDITOR'; readonly workoutId: string }
  | { readonly type: 'OPEN_EXERCISE_EDITOR'; readonly exerciseDefId?: string; readonly isNew: boolean }
  | { readonly type: 'EDIT_DRAFT' }
  | { readonly type: 'SAVE_DRAFT' }
  | { readonly type: 'SAVE_SUCCEEDED' }
  | { readonly type: 'SAVE_FAILED'; readonly error?: string }
  | { readonly type: 'CLOSE_EDITOR' }
  | { readonly type: 'REQUEST_DISCARD' }
  | { readonly type: 'CONFIRM_DISCARD' }
  | { readonly type: 'CANCEL_DISCARD' };

export const initialEditorMode: EditorMode = { view: 'manage' };

/**
 * Pure state machine transition function for the Manage/Editor navigation and draft state.
 * Prevents overlapping editor screens and guards against accidental loss of unsaved edits.
 */
export function editorTransition(state: EditorMode, event: EditorEvent): EditorMode {
  switch (event.type) {
    case 'OPEN_PROGRAM_EDITOR': {
      if (state.view !== 'manage' && 'draftState' in state && state.draftState === 'dirty') {
        // Cannot navigate away while unsaved edits exist without explicit discard
        return state;
      }
      return {
        view: 'program_editor',
        workoutId: event.workoutId,
        draftState: 'clean'
      };
    }

    case 'OPEN_WORKOUT_EDITOR': {
      if (state.view !== 'manage' && 'draftState' in state && state.draftState === 'dirty') {
        return state;
      }
      return {
        view: 'workout_editor',
        workoutId: event.workoutId,
        draftState: 'clean'
      };
    }

    case 'OPEN_EXERCISE_EDITOR': {
      if (state.view !== 'manage' && 'draftState' in state && state.draftState === 'dirty') {
        return state;
      }
      return {
        view: 'exercise_editor',
        exerciseDefId: event.exerciseDefId,
        isNew: event.isNew,
        draftState: 'clean'
      };
    }

    case 'EDIT_DRAFT': {
      if (state.view === 'manage') return state;
      return {
        ...state,
        draftState: 'dirty'
      };
    }

    case 'SAVE_DRAFT': {
      if (state.view === 'manage') return state;
      return {
        ...state,
        draftState: 'saving'
      };
    }

    case 'SAVE_SUCCEEDED': {
      if (state.view === 'manage') return state;
      return {
        ...state,
        draftState: 'saved'
      };
    }

    case 'SAVE_FAILED': {
      if (state.view === 'manage') return state;
      return {
        ...state,
        draftState: 'save_failed'
      };
    }

    case 'CLOSE_EDITOR': {
      if (state.view === 'manage') return state;
      if (state.draftState === 'dirty') {
        // If dirty, flag pendingExit so UI asks for confirmation
        return {
          ...state,
          pendingExit: true
        };
      }
      return { view: 'manage' };
    }

    case 'REQUEST_DISCARD': {
      if (state.view === 'manage') return state;
      return {
        ...state,
        pendingExit: true
      };
    }

    case 'CONFIRM_DISCARD': {
      return { view: 'manage' };
    }

    case 'CANCEL_DISCARD': {
      if (state.view === 'manage') return state;
      return {
        ...state,
        pendingExit: false
      };
    }

    default:
      return state;
  }
}
