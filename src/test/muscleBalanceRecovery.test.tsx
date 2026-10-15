// @vitest-environment jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MuscleBalanceRecovery } from '../components/MuscleBalanceRecovery';
import { FitnessDerivedContext } from '../context/FitnessDerivedContext';
import { buildFitnessIndex } from '../utils/fitnessDerivedSelectors';
import { createExerciseDefinitionMap } from '../utils/exerciseResolver';
import { INITIAL_EXERCISE_DEFINITIONS } from '../types/initialData';
import { SessionLog } from '../types/fitness';

describe('MuscleBalanceRecovery Component UI & Interaction Suite', () => {
  let container: HTMLDivElement;
  let root: Root;
  const defsMap = createExerciseDefinitionMap(INITIAL_EXERCISE_DEFINITIONS);

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function renderWithIndex(index: any, props: { startDate: string; endDate: string; referenceDate?: string }) {
    act(() => {
      root.render(
        <FitnessDerivedContext.Provider value={{ index } as any}>
          <MuscleBalanceRecovery
            startDate={props.startDate}
            endDate={props.endDate}
            timeRangeLabel="Last 14 Days"
            referenceDate={props.referenceDate || '2026-04-14'}
          />
        </FitnessDerivedContext.Provider>
      );
    });
  }

  it('renders clean dash and empty state when 0 eligible sets exist', () => {
    const emptyIndex = buildFitnessIndex([], defsMap, '2026-04-14');
    renderWithIndex(emptyIndex, { startDate: '2026-04-01', endDate: '2026-04-14' });

    // Coverage should show dash, not "0 / 0 sets (100%)"
    expect(container.textContent).toContain('Attribution Coverage:');
    expect(container.textContent).toContain('—');
    expect(container.textContent).not.toContain('0 / 0 sets (100%)');

    // Card 1 empty state message
    expect(container.textContent).toContain('No eligible completed sets recorded in this period.');

    // Card 2 zero-stimulus peak and empty state
    expect(container.textContent).toContain('No recent stimulus recorded in the 14-day window.');
    expect(container.textContent).toContain('No recent stimulus');
  });

  it('differentiates when completed sets exist but all are unclassified', () => {
    // Custom exercise with uninformative target
    const customDef = { id: 'cust_unknown', name: 'Unknown Move', target: 'Unknown' };
    const customDefsMap = createExerciseDefinitionMap([customDef as any]);

    const log: SessionLog = {
      id: 'log-unclass',
      workoutId: 'w',
      date: '2026-04-10',
      complete: true,
      durationMinutes: 30,
      sets: {
        cust_unknown: [{ id: 's1', weight: '50', reps: '10', done: true }],
      },
    };

    const index = buildFitnessIndex([log], customDefsMap, '2026-04-14');
    renderWithIndex(index, { startDate: '2026-04-01', endDate: '2026-04-14' });

    // Completed sets exist, but 0 attribution
    expect(container.textContent).toContain('Completed sets exist, but no muscle attribution could be assigned.');
    expect(container.textContent).not.toContain('No eligible completed sets recorded');
  });

  it('toggles coverage breakdown details and explains mapping limitation', () => {
    const log: SessionLog = {
      id: 'log-curated',
      workoutId: 'w',
      date: '2026-04-10',
      complete: true,
      durationMinutes: 30,
      sets: {
        e1: [{ id: 's1', weight: '60', reps: '10', done: true }], // Incline DB Press (Curated)
      },
    };

    const index = buildFitnessIndex([log], defsMap, '2026-04-14');
    renderWithIndex(index, { startDate: '2026-04-01', endDate: '2026-04-14' });

    // Before clicking Details
    expect(container.textContent).not.toContain('Curated:');

    // Click Details button
    const detailsBtn = container.querySelector('button[aria-label="Toggle coverage breakdown details"]') as HTMLButtonElement;
    expect(detailsBtn).toBeDefined();

    act(() => {
      detailsBtn.click();
    });

    // Breakdown is now visible
    expect(container.textContent).toContain('Curated:');
    expect(container.textContent).toContain('Inferred:');
    expect(container.textContent).toContain('Unclassified:');
    expect(container.textContent).toContain(
      'Attribution coverage measures how many eligible sets could be mapped to muscles; it does not measure the accuracy of the underlying biomechanical mapping.'
    );

    // Click Hide button
    act(() => {
      detailsBtn.click();
    });
    expect(container.textContent).not.toContain('Curated:');
  });

  it('toggles between top 6 ranked and all 15 anatomical groups', () => {
    const log: SessionLog = {
      id: 'log-multi',
      workoutId: 'w',
      date: '2026-04-10',
      complete: true,
      durationMinutes: 45,
      sets: {
        e1: [{ id: 's1', weight: '60', reps: '10', done: true }], // chest, front_delts, triceps
        e7: [{ id: 's2', weight: '50', reps: '10', done: true }], // lats, upper_back, biceps
        e14: [{ id: 's3', weight: '30', reps: '10', done: true }], // quads, glutes
      },
    };

    const index = buildFitnessIndex([log], defsMap, '2026-04-14');
    renderWithIndex(index, { startDate: '2026-04-01', endDate: '2026-04-14' });

    // Initial state: top 6 visible
    expect(container.textContent).toContain('View All (15 Anatomical Groups)');

    // Toggle to view all 15
    const viewAllBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('View All (15 Anatomical Groups)')
    ) as HTMLButtonElement;
    expect(viewAllBtn).toBeDefined();

    act(() => {
      viewAllBtn.click();
    });

    // All 15 groups displayed, including 0-exposure groups with tag
    expect(container.textContent).toContain('Show Top 6');
    expect(container.textContent).toContain('(0 exposure)');
    expect(container.textContent).toContain('Calves');

    // Toggle back to Top 6
    act(() => {
      viewAllBtn.click();
    });
    expect(container.textContent).toContain('View All (15 Anatomical Groups)');
  });

  it('displays residual stimulus with 2-decimal precision and authoritative peak label', () => {
    const log: SessionLog = {
      id: 'log-bench',
      workoutId: 'w',
      date: '2026-04-14', // Day 0 relative to referenceDate 2026-04-14
      complete: true,
      durationMinutes: 30,
      sets: {
        e5: [{ id: 's1', weight: '20', reps: '10', done: true }], // Triceps (1.0 WSE)
      },
    };

    const index = buildFitnessIndex([log], defsMap, '2026-04-14');
    renderWithIndex(index, { startDate: '2026-04-01', endDate: '2026-04-14', referenceDate: '2026-04-14' });

    // Residual score displayed with 2 decimals
    expect(container.textContent).toContain('1.00 res');

    // Peak label shows authoritative top muscle
    expect(container.textContent).toContain('Peak: Triceps');
    expect(container.textContent).not.toContain('No recent stimulus');
  });
});
