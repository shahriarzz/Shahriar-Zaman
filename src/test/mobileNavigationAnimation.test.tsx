// @vitest-environment jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

describe('GAINLOG Mobile Navigation Animation & Accessibility Suite', () => {
  let container: HTMLDivElement;
  let root: Root;

  const mockFitnessContextValue = {
    user: null,
    syncStatus: 'idle',
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

  function renderLayout(activeTab: ActiveTab = 'dashboard', onTabChange = vi.fn()) {
    act(() => {
      root.render(
        <FitnessContext.Provider value={mockFitnessContextValue as any}>
          <Layout activeTab={activeTab} onTabChange={onTabChange}>
            <div>Page Content</div>
          </Layout>
        </FitnessContext.Provider>
      );
    });
  }

  describe('1. Mobile bottom navigation layout and slot structure', () => {
    it('renders equal-width 4-column grid for mobile navigation items', () => {
      renderLayout('dashboard');

      const mobileBar = container.querySelector('.md\\:hidden.fixed.bottom-0');
      expect(mobileBar).toBeTruthy();

      const grid = mobileBar?.querySelector('.grid.grid-cols-4');
      expect(grid).toBeTruthy();

      const slots = grid?.querySelectorAll(':scope > div');
      expect(slots?.length).toBe(4);
    });

    it('enforces CONTROL_HEIGHT.touchTarget on all mobile navigation buttons', () => {
      renderLayout('dashboard');

      const mobileButtons = container.querySelectorAll('.md\\:hidden button[id^="mobile-nav-item-"]');
      expect(mobileButtons.length).toBe(4);

      mobileButtons.forEach(btn => {
        expect(btn.classList.contains('min-h-[44px]')).toBe(true);
        expect(btn.classList.contains('min-w-[44px]')).toBe(true);
        expect(btn.classList.contains('focus-visible:ring-2')).toBe(true);
      });
    });
  });

  describe('2. Active vs Inactive item behavior in mobile navigation', () => {
    it('active item renders icon and label side-by-side inside subtle dark pill with orange border', () => {
      renderLayout('dashboard');

      const activeBtn = container.querySelector('#mobile-nav-item-dashboard') as HTMLButtonElement;
      expect(activeBtn).toBeTruthy();
      expect(activeBtn.getAttribute('aria-current')).toBe('page');
      expect(activeBtn.getAttribute('aria-label')).toBe('Dash');

      // Pill container styling
      const pill = activeBtn.querySelector('.rounded-full');
      expect(pill).toBeTruthy();
      expect(pill?.className).toContain('border-orange-500');
      expect(pill?.className).toContain('text-orange-500');

      // Active item includes visual label with aria-hidden="true"
      const labelSpan = activeBtn.querySelector('span[aria-hidden="true"]');
      expect(labelSpan).toBeTruthy();
      expect(labelSpan?.textContent).toBe('Dash');
    });

    it('inactive items render only their icons without visual labels', () => {
      renderLayout('dashboard');

      const inactiveTabs: ActiveTab[] = ['history', 'analytics', 'manage'];
      inactiveTabs.forEach(tab => {
        const btn = container.querySelector(`#mobile-nav-item-${tab}`) as HTMLButtonElement;
        expect(btn).toBeTruthy();
        expect(btn.getAttribute('aria-current')).toBeNull();
        expect(btn.getAttribute('aria-label')).toBeTruthy();

        // No visual label rendered for inactive items
        const labelSpan = btn.querySelector('span[aria-hidden="true"]');
        expect(labelSpan).toBeNull();
      });
    });

    it('session activeTab leaves all 4 nav items inactive with only icons', () => {
      renderLayout('session');

      const mobileButtons = container.querySelectorAll('.md\\:hidden button[id^="mobile-nav-item-"]');
      expect(mobileButtons.length).toBe(4);

      mobileButtons.forEach(btn => {
        expect(btn.getAttribute('aria-current')).toBeNull();
        expect(btn.querySelector('span[aria-hidden="true"]')).toBeNull();
      });
    });
  });

  describe('3. Tab switching and interactive transitions', () => {
    it('calls onTabChange when a mobile navigation item is clicked', () => {
      const mockOnTabChange = vi.fn();
      renderLayout('dashboard', mockOnTabChange);

      const historyBtn = container.querySelector('#mobile-nav-item-history') as HTMLButtonElement;
      expect(historyBtn).toBeTruthy();

      act(() => {
        historyBtn.click();
      });

      expect(mockOnTabChange).toHaveBeenCalledWith('history');
    });

    it('transfers active pill and label when activeTab prop updates', () => {
      const mockOnTabChange = vi.fn();
      renderLayout('dashboard', mockOnTabChange);

      const dashBtn = container.querySelector('#mobile-nav-item-dashboard');
      const analyticsBtn = container.querySelector('#mobile-nav-item-analytics');
      expect(dashBtn?.getAttribute('aria-current')).toBe('page');
      expect(analyticsBtn?.getAttribute('aria-current')).toBeNull();
      expect(dashBtn?.querySelector('span[aria-hidden="true"]')?.textContent).toBe('Dash');

      // Switch tab to analytics
      renderLayout('analytics', mockOnTabChange);

      expect(dashBtn?.getAttribute('aria-current')).toBeNull();
      expect(analyticsBtn?.getAttribute('aria-current')).toBe('page');
      expect(analyticsBtn?.querySelector('span[aria-hidden="true"]')?.textContent).toBe('Analytics');
    });
  });

  describe('4. Desktop navigation preservation', () => {
    it('preserves desktop navigation items with unchanged structure and test IDs', () => {
      renderLayout('dashboard');

      const desktopNav = container.querySelector('.hidden.md\\:flex');
      expect(desktopNav).toBeTruthy();

      const desktopButtons = desktopNav?.querySelectorAll('button[id^="nav-item-"]');
      expect(desktopButtons?.length).toBe(4);

      const dashBtn = container.querySelector('#nav-item-dashboard') as HTMLButtonElement;
      expect(dashBtn).toBeTruthy();
      expect(dashBtn.classList.contains('min-h-[44px]')).toBe(true);
      expect(dashBtn.classList.contains('min-w-[44px]')).toBe(true);
      expect(dashBtn.textContent).toContain('Dash');
    });
  });
});
