import { WorkoutType } from '../types/fitness';
import { WORKOUT_COLORS } from '../utils/fitnessHelpers';

export const CANVAS_HEX = '#09090e';

export const SURFACE = {
  subtle: 'bg-zinc-900/30',   // subtle section backgrounds
  default: 'bg-zinc-900/60',   // standard card background
  elevated: 'bg-zinc-900/90', // elevated floating menus/dropdowns
  recessed: 'bg-zinc-950/80', // recessed/nested content
  raised: 'bg-gradient-to-br from-zinc-900 to-zinc-950', // high-contrast card background
  panel: 'bg-[#0e0e15]',      // dialogs and prominent floating panels
  overlay: 'bg-zinc-950/95 backdrop-blur-xl', // modal popovers / sheets
  backdrop: 'bg-[#040409]/80 backdrop-blur-md', // modal dialog backdrops
  canvas: 'bg-[#09090e]',     // primary application root canvas
  canvasHeader: 'bg-[#09090e]/95 backdrop-blur-md', // sticky header canvas
} as const;

export const BORDER = {
  subtle: 'border-zinc-800/50',
  standard: 'border-zinc-800',
  strong: 'border-zinc-700',
  interactive: 'border-zinc-800 hover:border-zinc-700',
  hover: 'hover:border-zinc-700',
  canvasHalo: 'border-[#09090e]',
} as const;

export const RADIUS = {
  badge: 'rounded-lg',    // badges, compact tags, micro indicators
  button: 'rounded-xl',   // buttons, interactive controls, inputs
  card: 'rounded-2xl',     // cards, container surfaces
  panel: 'rounded-3xl',   // dialogs, modals, floating panels
  pill: 'rounded-full',   // circular avatars, status dots, fully rounded pills
} as const;

export const SPACING = {
  none: 'p-0',
  compact: 'py-2.5 px-3.5',
  standard: 'p-5',
  section: 'p-6',
  hero: 'p-8',
  badgeSm: 'px-2 py-0.5',
  badgeMd: 'px-2.5 py-1',
  segmentedSm: 'px-3 py-1',
  segmentedMd: 'px-4 py-1.5',
} as const;

export type SpacingIntent = keyof typeof SPACING;

export const NAV = {
  item: 'py-2 px-3.5 min-h-[44px]',
  itemGap: 'gap-1',
} as const;

export const EDITOR_HEADER = {
  container: 'flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b pb-4',
  divider: 'h-4 w-px bg-zinc-800 hidden sm:block',
} as const;

export const CONTROL_HEIGHT = {
  sm: 'min-h-[32px] h-8',
  md: 'min-h-[40px] h-10',
  lg: 'min-h-[48px] h-12',
  touchTarget: 'min-h-[44px] min-w-[44px]',
} as const;

export const ICON_SIZE = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  hero: 32,
} as const;

// -------------------------------------------------------------
// MOTION & TRANSITION TOKENS
// -------------------------------------------------------------

/**
 * Canonical duration scale in milliseconds.
 * - fast (150ms): Micro-interactions, value opacity transitions
 * - standard (200ms): Interactive hovers, color transitions, accordion collapses
 * - relaxed (250ms): View and section entrances, modal surfaces, completion pulses
 */
export const DURATION = {
  fast: 150,
  standard: 200,
  relaxed: 250,
} as const;

// Reusable Tailwind CSS transition utility tokens.
// Standardized on property-specific transitions with motion-reduce:transition-none for accessibility.
export const TRANSITION = {
  colors: 'transition-colors duration-200 motion-reduce:transition-none',
  transform: 'transition-transform duration-300 motion-reduce:transition-none',
  opacity: 'transition-opacity duration-150 motion-reduce:transition-none',
  interactive: 'transition-[background-color,border-color,color] duration-200 motion-reduce:transition-none',
  button: 'transition-[background-color,border-color,color,transform] duration-200 motion-reduce:transition-none',
  progressBar: 'transition-[width,background-color] duration-300 motion-reduce:transition-none',
} as const;

/**
 * Reusable Motion configurations.
 * 
 * Architecture Note on Compositor Performance vs Layout Reflow:
 * 1. Compositor-friendly entrances:
 *    - `entrance`, `viewEntrance`, `dialogSurface`, `calendarPanel`: operate strictly on GPU-accelerated
 *      properties (opacity, translateY, scale) with small displacements (6-10px) to prevent layout reflow.
 * 2. Layout-affecting accordion collapses:
 *    - `collapse`: animates `height: 0` to `height: 'auto'` with overflow clipping. Reserved exclusively
 *      for progressive drawer disclosure where content layout expansion is functionally required.
 */
export const MOTION_CONFIG = {
  // Section entrance (subtle fade & rise: ~6px, 250ms relaxed)
  entrance: {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: DURATION.relaxed / 1000, ease: 'easeOut' },
  },
  // View/modal drill-down entrance (e.g. Program Editor, Fullscreen views)
  viewEntrance: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 8 },
    transition: { duration: DURATION.relaxed / 1000, ease: 'easeOut' },
  },
  // Dialog modal surface entrance (spring with subtle scale & rise)
  dialogSurface: {
    initial: { opacity: 0, scale: 0.95, y: 10 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95, y: 10 },
    transition: { type: 'spring' as const, damping: 25, stiffness: 350 },
  },
  // Calendar day detail side-panel entrance
  calendarPanel: {
    initial: { opacity: 0, x: 16 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 16 },
    transition: { duration: DURATION.relaxed / 1000, ease: 'easeOut' },
  },
  // Accordion drawer expansion (200ms standard)
  collapse: {
    initial: { height: 0, opacity: 0 },
    animate: { height: 'auto', opacity: 1 },
    exit: { height: 0, opacity: 0 },
    transition: { duration: DURATION.standard / 1000, ease: 'easeInOut' },
  },
  // Subtle completion celebration / pulse
  pulseSubtle: {
    scale: [1, 1.015, 1],
    transition: { duration: DURATION.relaxed / 1000, ease: 'easeOut' },
  },
  // Stagger delays for section sequences (subtle 40ms intervals, capped to avoid waiting)
  staggerDelay: (index: number, maxDelay = 0.16) => Math.min(index * 0.04, maxDelay),
} as const;

export const INTERACTIVE = {
  hover: 'hover:bg-zinc-800/60 hover:text-white transition-colors motion-reduce:transition-none',
  active: 'active:scale-[0.99] transition-transform motion-reduce:transition-none',
  disabled: 'opacity-40 cursor-not-allowed pointer-events-none select-none',
} as const;

export const FOCUS = {
  ring: 'focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/40',
  visible: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
} as const;

export const SHADOW = {
  elevation: 'shadow-md',
  panel: 'shadow-2xl',
  modal: 'shadow-2xl', // Narrow semantic alias for dialog modals sharing top elevation tier
  /**
   * Generates inline CSSProperties boxShadow for dynamic accent glow.
   * Single source of truth for glow geometry (0 0 20px) and canonical ~25% alpha.
   *
   * Supported color formats and alpha rules:
   * 1. Six-digit hex (#rrggbb): applies canonical 25% glow alpha (hex 40): `0 0 20px #rrggbb40`.
   * 2. Three-digit hex (#rgb): expands each nibble to two characters and applies canonical 25% glow alpha: `0 0 20px #rrggbbaa40`.
   * 3. Eight-digit hex (#rrggbbaa): explicitly preserves caller-supplied alpha: `0 0 20px #rrggbbaa`.
   * 4. rgb(r, g, b): validates channels (0-255) and applies canonical 25% alpha: `0 0 20px rgba(r, g, b, 0.25)`.
   * 5. rgba(r, g, b, a): validates channels (0-255) and alpha (0-1), explicitly preserving caller-supplied alpha: `0 0 20px rgba(r, g, b, a)`.
   *
   * Any unsupported format, malformed hex, out-of-range channel/alpha, or empty input returns `{ boxShadow: 'none' }`.
   */
  accentGlowStyle: (color: string): { boxShadow: string } => {
    if (!color || typeof color !== 'string') return { boxShadow: 'none' };
    const trimmed = color.trim();
    if (!trimmed) return { boxShadow: 'none' };

    // 1. 6-digit hex: #rrggbb
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
      return { boxShadow: `0 0 20px ${trimmed}40` };
    }

    // 2. 3-digit hex: #rgb
    if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
      const r = trimmed[1];
      const g = trimmed[2];
      const b = trimmed[3];
      return { boxShadow: `0 0 20px #${r}${r}${g}${g}${b}${b}40` };
    }

    // 3. 8-digit hex: #rrggbbaa (preserves caller alpha)
    if (/^#[0-9a-fA-F]{8}$/.test(trimmed)) {
      return { boxShadow: `0 0 20px ${trimmed}` };
    }

    const isValidChannel = (val: number) => Number.isInteger(val) && val >= 0 && val <= 255;

    // 4. rgb(r, g, b)
    const rgbMatch = trimmed.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
    if (rgbMatch) {
      const r = Number(rgbMatch[1]);
      const g = Number(rgbMatch[2]);
      const b = Number(rgbMatch[3]);
      if (isValidChannel(r) && isValidChannel(g) && isValidChannel(b)) {
        return { boxShadow: `0 0 20px rgba(${r}, ${g}, ${b}, 0.25)` };
      }
      return { boxShadow: 'none' };
    }

    // 5. rgba(r, g, b, a) (preserves caller alpha)
    const rgbaMatch = trimmed.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)$/i);
    if (rgbaMatch) {
      const r = Number(rgbaMatch[1]);
      const g = Number(rgbaMatch[2]);
      const b = Number(rgbaMatch[3]);
      const a = Number(rgbaMatch[4]);
      if (isValidChannel(r) && isValidChannel(g) && isValidChannel(b) && !Number.isNaN(a) && a >= 0 && a <= 1) {
        return { boxShadow: `0 0 20px rgba(${r}, ${g}, ${b}, ${rgbaMatch[4]})` };
      }
      return { boxShadow: 'none' };
    }

    return { boxShadow: 'none' };
  },
  emeraldGlow: 'shadow-[0_0_15px_rgba(16,185,129,0.3)]',
  emeraldSubtle: 'shadow-[0_0_15px_rgba(16,185,129,0.2)]',
  emeraldInset: 'shadow-[inset_0_0_12px_rgba(16,185,129,0.12)]',
  emeraldDate: 'shadow-[0_0_8px_rgba(16,185,129,0.4)]',
  amberWarning: 'shadow-[0_0_8px_rgba(245,158,11,0.15)]',
} as const;

// Central color-semantic map — resolves a semantic name to its actual color value.
// Standardized semantic definitions:
// - orange: primary action / achievement / brand
// - emerald: data visualization / analytics / success
// - amber: warning / caution / partial
// - red: destructive / error / failed / missed
// - indigo: intelligence / strength trend (approved canonical system color)
// - zinc: neutral / unclassified / placeholder
export const SEMANTIC_COLORS = {
  orange: '#f97316',
  emerald: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
  indigo: '#6366f1',
  zinc: '#71717a',
} as const;

export type SemanticColorKey = keyof typeof SEMANTIC_COLORS;
export type SemanticColor = SemanticColorKey | WorkoutType;

export interface SemanticColorConfig {
  hex: string;
  role: string;
  text: string;
  textLight: string;
  bg: string;
  bgSubtle: string;
  border: string;
  borderSubtle: string;
  compound: string;
}

export const SEMANTIC_PALETTE: Record<SemanticColorKey, SemanticColorConfig> = {
  orange: {
    hex: SEMANTIC_COLORS.orange,
    role: 'primary action / achievement / brand',
    text: 'text-orange-500',
    textLight: 'text-orange-400',
    bg: 'bg-orange-500',
    bgSubtle: 'bg-orange-500/10',
    border: 'border-orange-500',
    borderSubtle: 'border-orange-500/30',
    compound: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  },
  emerald: {
    hex: SEMANTIC_COLORS.emerald,
    role: 'data visualization / analytics / success',
    text: 'text-emerald-500',
    textLight: 'text-emerald-400',
    bg: 'bg-emerald-500',
    bgSubtle: 'bg-emerald-500/10',
    border: 'border-emerald-500',
    borderSubtle: 'border-emerald-500/30',
    compound: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  },
  amber: {
    hex: SEMANTIC_COLORS.amber,
    role: 'warning / caution / partial',
    text: 'text-amber-500',
    textLight: 'text-amber-400',
    bg: 'bg-amber-500',
    bgSubtle: 'bg-amber-500/10',
    border: 'border-amber-500',
    borderSubtle: 'border-amber-500/30',
    compound: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  },
  red: {
    hex: SEMANTIC_COLORS.red,
    role: 'destructive / error / failed / missed',
    text: 'text-red-500',
    textLight: 'text-red-400',
    bg: 'bg-red-500',
    bgSubtle: 'bg-red-500/10',
    border: 'border-red-500',
    borderSubtle: 'border-red-500/30',
    compound: 'text-red-400 bg-red-500/10 border-red-500/30',
  },
  indigo: {
    hex: SEMANTIC_COLORS.indigo,
    role: 'intelligence / strength trend',
    text: 'text-indigo-500',
    textLight: 'text-indigo-400',
    bg: 'bg-indigo-500',
    bgSubtle: 'bg-indigo-500/10',
    border: 'border-indigo-500',
    borderSubtle: 'border-indigo-500/30',
    compound: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30',
  },
  zinc: {
    hex: SEMANTIC_COLORS.zinc,
    role: 'neutral / unclassified / placeholder',
    text: 'text-zinc-500',
    textLight: 'text-zinc-400',
    bg: 'bg-zinc-700',
    bgSubtle: 'bg-zinc-900/50',
    border: 'border-zinc-800',
    borderSubtle: 'border-zinc-800/50',
    compound: 'text-zinc-400 bg-zinc-900/50 border-zinc-800',
  },
} as const;

// Canonical shared chart theme for visualization consistency
export const CHART_THEME = {
  grid: '#27272a',        // zinc-800 (structural grid lines & borders)
  axisText: '#71717a',    // zinc-500 (axis ticks & markers)
  labelText: '#a1a1aa',   // zinc-400 (secondary descriptions & tooltips)
  background: CANVAS_HEX, // Shared canvas background
  text: '#ffffff',
  emerald: SEMANTIC_COLORS.emerald,
  emeraldLight: '#34d399',
  orange: SEMANTIC_COLORS.orange,
  amber: SEMANTIC_COLORS.amber,
  red: SEMANTIC_COLORS.red,
  indigo: SEMANTIC_COLORS.indigo,
  zinc: SEMANTIC_COLORS.zinc,
} as const;

export function getAccentColor(accent?: SemanticColor | null): string | undefined {
  if (!accent) return undefined;
  if (accent in SEMANTIC_COLORS) {
    return SEMANTIC_COLORS[accent as keyof typeof SEMANTIC_COLORS];
  }
  if (accent in WORKOUT_COLORS) {
    return WORKOUT_COLORS[accent as WorkoutType]; // fallback to workout-type palette
  }
  return undefined;
}

export const TYPOGRAPHY = {
  // Headings & Titles
  eyebrow: 'font-mono text-[10px] uppercase tracking-[0.2em] font-bold',
  titlePage: 'font-display text-3xl uppercase tracking-tight text-white leading-none',
  titleSection: 'font-display text-2xl uppercase tracking-tight text-white leading-none',
  titleSubsection: 'font-display text-lg uppercase tracking-wide text-white leading-none', // Structural section headers
  cardTitle: 'font-display text-lg uppercase tracking-wide text-white leading-none', // Card containers & modal section titles
  
  // Card & Stat Tokens
  label: 'font-mono text-[10px] text-zinc-400 uppercase tracking-wider font-bold',
  unit: 'font-mono text-xs text-zinc-500 font-normal',
  cardValue: 'font-mono text-2xl font-bold tracking-tight text-white',
  statValue: 'font-display text-3xl sm:text-[2rem] uppercase tracking-tight text-white leading-none tabular-nums',
  statValueHero: 'font-display text-4xl sm:text-5xl uppercase tracking-tight text-white leading-none tabular-nums',
  
  // Text & Body
  body: 'font-sans text-sm text-zinc-400 leading-relaxed',
  bodySecondary: 'font-sans text-xs text-zinc-400 leading-normal',
  metadata: 'font-mono text-[10px] text-zinc-500 uppercase tracking-wider',
  caption: 'font-mono text-[10px] text-zinc-500 uppercase tracking-wide',
  micro: 'font-mono text-[9px] uppercase tracking-wider font-bold',
  
  // Controls & States
  buttonSm: 'font-mono text-[11px] uppercase tracking-wider font-bold',
  button: 'font-mono text-xs uppercase tracking-wider font-bold',
  badgeSm: 'font-mono text-[9px] uppercase tracking-wider font-bold',
  badgeMd: 'font-mono text-[10px] uppercase tracking-wider font-bold',
  segmentedSm: 'font-mono text-[10px] uppercase tracking-wider font-bold',
  segmentedMd: 'font-mono text-xs uppercase tracking-wider font-bold',
  dialogFooter: 'font-mono text-[10px] text-zinc-500 uppercase tracking-widest',
  helperText: 'font-mono text-[10px] text-zinc-500 font-normal tracking-normal',
  errorText: 'font-mono text-[10px] text-red-400 font-normal tracking-normal',
  successText: 'font-mono text-[10px] text-emerald-400 font-normal tracking-normal',
  navLabel: 'font-mono text-[10px] uppercase tracking-wider font-bold',

  // Tables & Lists
  listValue: 'font-mono text-xs font-bold text-zinc-200 tabular-nums',
  listLabel: 'font-mono text-xs text-zinc-400 font-medium',
  
  // Empty States
  emptyTitle: 'font-display text-sm uppercase tracking-wide text-zinc-300',
  emptyDescription: 'font-mono text-[10px] text-zinc-500 uppercase tracking-wider max-w-[260px] leading-relaxed',
} as const;

export const GAP = {
  none: 'gap-0',
  micro: 'gap-1',
  xs: 'gap-1.5',
  sm: 'gap-2.5',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
  '2xl': 'gap-10',
} as const;

export type GapSize = keyof typeof GAP;

export const STACK_SPACING = {
  none: 'space-y-0',
  xs: 'space-y-1.5',
  sm: 'space-y-2.5',
  md: 'space-y-4',
  lg: 'space-y-6',
  xl: 'space-y-8',
  '2xl': 'space-y-10',
} as const;

export type StackSpacing = keyof typeof STACK_SPACING;

/**
 * Narrow, audited allowlist of documented token pairs that intentionally share
 * appearance values due to distinct semantic roles.
 */
export const DOCUMENTED_SEMANTIC_TOKEN_ALLOWLIST = {
  'SHADOW.panel === SHADOW.modal':
    'Floating slide-over panels and centered modal dialogs share the topmost shadow-2xl elevation tier.',
  'TYPOGRAPHY.titleSubsection === TYPOGRAPHY.cardTitle':
    'Structural section headings and modal/container card titles share the display text-lg scale for visual hierarchy.',
  'TYPOGRAPHY.badgeMd === TYPOGRAPHY.segmentedSm':
    'Metadata badge labels and compact segmented control items share the mono 10px uppercase tracking-wider scale.',
} as const;

