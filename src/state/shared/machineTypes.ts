/**
 * GAINLOG State Machine Framework
 * Lightweight, zero-dependency, domain-specific TypeScript state machine contracts.
 */

export interface StateMachine<TState, TEvent> {
  readonly initialState: TState;
  readonly transition: (state: TState, event: TEvent) => TState;
}

export interface TransitionResult<TState, TEffect = never> {
  readonly state: TState;
  readonly effect?: TEffect;
}
