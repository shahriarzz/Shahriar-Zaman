// @vitest-environment jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Layout, ActiveTab } from '../components/Layout';
import { FitnessContext } from '../context/FitnessContext';

vi.mock('../utils/haptics', () => ({
  haptics: {
    light: vi.fn(),
    medium: vi.fn(),
    selection: vi.fn(),
    selectionChanged: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    destructive: vi.fn(),
    vibrate: vi.fn(),
  }
}));

describe('GAINLOG Loading and Transition Refinement Suite', () => {
  let container: HTMLDivElement;
  let root: Root;

  const mockFitnessContextValue = {
    user: null,
    loading: true, // Cloud sync is loading in background
    isInitialized: true, // Local storage is initialized
    syncStatus: 'syncing',
    syncError: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
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

  describe('P0 — Page Transition Motion Removal & Restrained Pill Transitions', () => {
    it('verifies Layout.tsx does not use AnimatePresence mode="wait" or vertical y translations on the page body', () => {
      const layoutSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/Layout.tsx'), 'utf8');

      // The main container must directly render {children} without mode="wait" delaying mounting
      expect(layoutSrc).not.toContain('<AnimatePresence mode="wait">');
      expect(layoutSrc).not.toContain('y: 10');
      expect(layoutSrc).not.toContain('y: -10');

      // Verifies main element structure
      expect(layoutSrc).toContain('<main className="pb-[calc(6rem+env(safe-area-inset-bottom,0px))] max-w-5xl mx-auto px-4 md:px-6">');
      expect(layoutSrc).toContain('{children}');
    });

    it('verifies mobile navigation pill uses restrained ease-out transition instead of spring', () => {
      const layoutSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/Layout.tsx'), 'utf8');

      // Restrained easeOut transition on pill motion.div
      expect(layoutSrc).toContain("ease: 'easeOut'");
      expect(layoutSrc).not.toContain("type: 'spring'");
      expect(layoutSrc).not.toContain('stiffness: 380');
    });

    it('immediately renders children in Layout when tab prop changes', () => {
      let activeTab: ActiveTab = 'dashboard';

      act(() => {
        root.render(
          <FitnessContext.Provider value={mockFitnessContextValue as any}>
            <Layout activeTab={activeTab} onTabChange={(t) => { activeTab = t; }}>
              <div id="content-display">Content for {activeTab}</div>
            </Layout>
          </FitnessContext.Provider>
        );
      });

      expect(container.querySelector('#content-display')?.textContent).toBe('Content for dashboard');

      // Change tab: content updates synchronously without waiting for exit animations
      act(() => {
        activeTab = 'history';
        root.render(
          <FitnessContext.Provider value={mockFitnessContextValue as any}>
            <Layout activeTab={activeTab} onTabChange={(t) => { activeTab = t; }}>
              <div id="content-display">Content for {activeTab}</div>
            </Layout>
          </FitnessContext.Provider>
        );
      });

      expect(container.querySelector('#content-display')?.textContent).toBe('Content for history');
    });
  });

  describe('P1 — Bundle Code Splitting & Tab State Preservation', () => {
    it('verifies App.tsx lazy-loads secondary views and keeps Dashboard static', () => {
      const appSrc = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');

      // Dashboard must remain static
      expect(appSrc).toContain("import { Dashboard } from './components/Dashboard';");

      // Secondary views must be lazy-loaded via React.lazy
      expect(appSrc).toContain("const SessionView = lazy(() => import('./components/SessionView')");
      expect(appSrc).toContain("const HistoryView = lazy(() => import('./components/HistoryView')");
      expect(appSrc).toContain("const AnalyticsView = lazy(() => import('./components/AnalyticsView')");
      expect(appSrc).toContain("const ManageView = lazy(() => import('./components/ManageView')");

      // Suspense boundary must be present inside Layout with aria-busy fallback
      expect(appSrc).toContain('<Suspense');
      expect(appSrc).toContain('aria-busy="true"');
      expect(appSrc).not.toContain('min-h-[50vh]');
    });

    it('verifies App.tsx includes idle preloading of secondary view chunks', () => {
      const appSrc = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');

      expect(appSrc).toContain('preloadSecondaryViews');
      expect(appSrc).toContain("import('./components/SessionView')");
      expect(appSrc).toContain("import('./components/HistoryView')");
      expect(appSrc).toContain("import('./components/AnalyticsView')");
      expect(appSrc).toContain("import('./components/ManageView')");
      expect(appSrc).toContain('requestIdleCallback');
    });

    it('verifies Layout.tsx removed layout animation and horizontal motion from mobile nav pill', () => {
      const layoutSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/Layout.tsx'), 'utf8');

      // Must not animate layout width/position
      expect(layoutSrc).not.toContain('layout={!shouldReduceMotion}');

      // Must be opacity-only without horizontal translation
      expect(layoutSrc).not.toContain('x: -4');
      expect(layoutSrc).toContain('initial={{ opacity: 0 }}');
      expect(layoutSrc).toContain('animate={{ opacity: 1 }}');
      expect(layoutSrc).toContain('exit={{ opacity: 0 }}');
    });

    it('verifies useFitnessData initializes isInitialized synchronously and gates initial mount persist', () => {
      const hookSrc = fs.readFileSync(path.join(process.cwd(), 'src/hooks/useFitnessData.ts'), 'utf8');

      // Must initialize to true synchronously so client renders Dashboard immediately
      expect(hookSrc).toContain('const [isInitialized, setIsInitialized] = useState(true);');

      // Must use isFirstMountRef to avoid redundant write back on initial mount
      expect(hookSrc).toContain('isFirstMountRef');
      expect(hookSrc).toContain('if (isFirstMountRef.current)');
    });

    it('verifies App.tsx gates boot screen on !isInitialized rather than cloud sync loading', () => {
      const appSrc = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');

      // The bootloader screen must check isInitialized
      expect(appSrc).toContain('if (!isInitialized)');
      expect(appSrc).not.toContain('if (loading) {\n    // Determine dynamic network');

      // Native splash screen hiding must check isInitialized
      expect(appSrc).toContain('if (isInitialized) {');
    });

    it('verifies App.tsx preserves visited tab state with hidden containers', () => {
      const appSrc = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');

      // visitedTabs tracking
      expect(appSrc).toContain('visitedTabs');
      expect(appSrc).toContain('markTabVisited');
      expect(appSrc).toContain("className={activeTab === 'dashboard' ? undefined : 'hidden'}");
      expect(appSrc).toContain("className={activeTab === 'history' ? undefined : 'hidden'}");
    });
  });
});
