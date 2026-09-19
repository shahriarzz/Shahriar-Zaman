import { WorkoutType } from '../types/fitness';
import { WORKOUT_COLORS } from '../utils/fitnessHelpers';

export const SURFACE = {
  subtle: 'bg-zinc-900/30',   // subtle section backgrounds
  default: 'bg-zinc-900/60',   // standard card background
  elevated: 'bg-zinc-900/90', // elevated floating menus/dropdowns
  recessed: 'bg-zinc-950/80', // recessed/nested content
  raised: 'bg-gradient-to-br from-zinc-900 to-zinc-950', // high-contrast card background
  panel: 'bg-[#0e0e15]',      // dialogs and prominent floating panels
  overlay: 'bg-zinc-950/95 backdrop-blur-xl', // modal backdrops / sheets
  canvas: 'bg-[#09090e]',     // primary application root canvas
  canvasHeader: 'bg-[#09090e]/95 backdrop-blur-md', // sticky header canvas
} as const;

export const BORDER = {
  subtle: 'border-zinc-800/50',
  standard: 'border-zinc-800',
  strong: 'border-zinc-700',
  interactive: 'border-zinc-800 hover:border-zinc-700',
  canvasHalo: 'border-[#09090e]',
} as const;

export const RADIUS = {
  button: 'rounded-xl',
  card: 'rounded-2xl',
  panel: 'rounded-3xl',
  pill: 'rounded-full',
  input: 'rounded-xl',
  sm: 'rounded-lg',
  md: 'rounded-xl',
  lg: 'rounded-2xl',
  xl: 'rounded-3xl',
} as const;

export const SPACING = {
  none: 'p-0',
  compact: 'py-2.5 px-3.5',
  standard: 'p-5',
  section: 'p-6',
  hero: 'p-8',
  modal: 'p-6',
} as const;

export type SpacingIntent = keyof typeof SPACING;

export const PAGE_SPACING = {
  container: 'space-y-6 md:space-y-8 pb-16',
  section: 'space-y-4 md:space-y-6',
} as const;

export const CONTROL_HEIGHT = {
  sm: 'min-h-[30px] h-[30px]',
  md: 'min-h-[38px] h-[38px]',
  lg: 'min-h-[46px] h-[46px]',
} as const;

export const ICON_SIZE = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  hero: 32,
} as const;

export const INTERACTIVE = {
  hover: 'hover:bg-zinc-800/60 hover:text-white transition-colors',
  active: 'active:scale-[0.99] transition-transform',
  focus: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
  disabled: 'opacity-40 cursor-not-allowed pointer-events-none select-none',
} as const;

export const SHADOW = {
  elevation: 'shadow-md',
  panel: 'shadow-2xl',
  modal: 'shadow-2xl',
  // accentGlow reserved exclusively for active/selected/achievement states — never decorative
  accentGlow: (hex: string) => `shadow-[0_0_20px_${hex}40]`,
} as const;

// Central color-semantic map — resolves a semantic name to its actual color value.
export const SEMANTIC_COLORS = {
  orange: '#f97316',   // primary action / achievement / brand
  emerald: '#10b981',  // data visualization / analytics / success
  amber: '#eab308',    // warning / caution / partial
  red: '#ef4444',      // destructive / error / failed / missed
  indigo: '#6366f1',   // intelligence / strength trend
  zinc: '#71717a',     // neutral — no meaning
} as const;

export type SemanticColor = keyof typeof SEMANTIC_COLORS | WorkoutType;

export const SEMANTIC_UI = {
  primary: 'text-orange-500 bg-orange-500/10 border-orange-500/30',
  success: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  warning: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  destructive: 'text-red-400 bg-red-500/10 border-red-500/30',
  neutral: 'text-zinc-400 bg-zinc-900/50 border-zinc-800',
  mutedText: 'text-zinc-500',
  disabledText: 'text-zinc-600',
  focus: 'focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 outline-none',
  selected: 'border-orange-500 bg-orange-500/10 text-white shadow-[0_0_15px_rgba(249,115,22,0.15)]',
  activeSurface: 'bg-zinc-800/80',
  hoverSurface: 'hover:bg-zinc-900/80 hover:border-zinc-700 transition-all',
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
  eyebrow: 'font-mono text-[9px] uppercase tracking-[0.25em] font-bold',
  titlePage: 'font-display text-3xl uppercase tracking-tight text-white leading-none',
  pageTitle: 'font-display text-3xl uppercase tracking-tight text-white leading-none',
  titleSection: 'font-display text-2xl uppercase tracking-tight text-white leading-none',
  sectionTitle: 'font-display text-2xl uppercase tracking-tight text-white leading-none',
  titleSubsection: 'font-display text-lg uppercase tracking-wide text-white leading-none',
  subsectionTitle: 'font-display text-lg uppercase tracking-wide text-white leading-none',
  cardTitle: 'font-display text-lg uppercase tracking-wide text-white leading-none',
  
  // Card & Stat Tokens
  cardLabel: 'font-mono text-[10px] text-zinc-400 uppercase tracking-wider font-bold',
  cardValue: 'font-mono text-2xl font-bold tracking-tight text-white',
  cardUnit: 'font-mono text-xs text-zinc-500 font-normal',
  label: 'font-mono text-[10px] text-zinc-400 uppercase tracking-wider font-bold',
  statLabel: 'font-mono text-[10px] text-zinc-400 uppercase tracking-wider font-bold',
  unit: 'font-mono text-xs text-zinc-500 font-normal',
  statValue: 'font-display text-3xl sm:text-[2rem] uppercase tracking-tight text-white leading-none tabular-nums',
  statValueHero: 'font-display text-4xl sm:text-5xl uppercase tracking-tight text-white leading-none tabular-nums',
  
  // Text & Body
  body: 'font-sans text-sm text-zinc-400 leading-relaxed',
  bodySecondary: 'font-sans text-xs text-zinc-400 leading-normal',
  supporting: 'font-sans text-xs text-zinc-400 leading-normal',
  metadata: 'font-mono text-[10px] text-zinc-500 uppercase tracking-wider',
  caption: 'font-mono text-[9px] text-zinc-500 uppercase tracking-wide',
  micro: 'font-mono text-[8px] uppercase tracking-widest font-bold',
  
  // Controls & States
  buttonLabel: 'font-mono text-xs uppercase tracking-wider font-bold',
  buttonText: 'font-mono text-xs uppercase tracking-wider font-bold',
  badgeText: 'font-mono text-[10px] uppercase tracking-wider font-bold',
  inputLabel: 'font-mono text-[10px] text-zinc-400 uppercase tracking-wider font-bold',
  formLabel: 'font-mono text-[10px] text-zinc-400 uppercase tracking-wider font-bold',
  errorText: 'font-mono text-[10px] text-red-400 font-normal tracking-normal',
  formError: 'font-mono text-[10px] text-red-400 font-normal tracking-normal',
  helperText: 'font-mono text-[10px] text-zinc-500 font-normal tracking-normal',
  formHelper: 'font-mono text-[10px] text-zinc-500 font-normal tracking-normal',
  formSuccess: 'font-mono text-[10px] text-emerald-400 font-normal tracking-normal',
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
