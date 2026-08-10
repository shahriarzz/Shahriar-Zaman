import { WorkoutType } from '../types/fitness';
import { WORKOUT_COLORS } from '../utils/fitnessHelpers';

export const SURFACE = {
  subtle: 'bg-zinc-900/30',   // subtle section backgrounds
  default: 'bg-zinc-900/60',   // standard card background
  recessed: 'bg-zinc-950/80', // recessed/nested content
} as const;

export const BORDER = {
  subtle: 'border-zinc-800/50',
  standard: 'border-zinc-800',
} as const;

export const RADIUS = {
  button: 'rounded-xl',
  card: 'rounded-2xl',
  panel: 'rounded-3xl',
  pill: 'rounded-full',
} as const;

export const SPACING = {
  none: 'p-0',
  compact: 'py-2.5 px-3.5',
  standard: 'p-5',
  section: 'p-6',
  relaxed: 'p-6',
  hero: 'p-8',
} as const;

export type SpacingIntent = keyof typeof SPACING;

export const SHADOW = {
  elevation: 'shadow-md',
  panel: 'shadow-2xl',
  // accentGlow reserved exclusively for active/selected/achievement states — never decorative
  accentGlow: (hex: string) => `shadow-[0_0_20px_${hex}40]`,
} as const;

// Central color-semantic map — resolves a semantic name to its actual color value.
export const SEMANTIC_COLORS = {
  orange: '#f97316',   // primary action / achievement / brand
  emerald: '#10b981',  // data visualization / analytics / success
  amber: '#eab308',    // warning / caution / partial
  red: '#ef4444',      // destructive / error / failed / missed
  zinc: '#71717a',     // neutral — no meaning
} as const;

export type SemanticColor = keyof typeof SEMANTIC_COLORS | WorkoutType;

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
  eyebrow: 'font-mono text-[9px] uppercase tracking-[0.25em] font-bold',
  titlePage: 'font-display text-3xl uppercase tracking-tight text-white leading-none',
  titleSection: 'font-display text-2xl uppercase tracking-tight text-white leading-none',
  titleSubsection: 'font-display text-lg uppercase tracking-wide text-white leading-none',
  body: 'font-sans text-sm text-zinc-400 leading-relaxed',
  label: 'font-mono text-[10px] text-zinc-400 uppercase tracking-wider font-bold',
  unit: 'font-mono text-xs text-zinc-500 font-normal',
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
