import { WorkoutType } from '../types/fitness';
import { WORKOUT_COLORS } from '../utils/fitnessHelpers';

export const SURFACE = {
  1: 'bg-zinc-900/30',   // subtle section backgrounds
  2: 'bg-zinc-900/60',   // standard card background
  3: 'bg-zinc-950/80',   // recessed/nested content
} as const;

export const BORDER = {
  subtle: 'border-zinc-800/50',
  default: 'border-zinc-800',
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
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
  relaxed: 'p-6 sm:p-8',
  hero: 'p-8',
} as const;

export const SHADOW = {
  elevation: 'shadow-md',
  panel: 'shadow-2xl',
  // glow reserved exclusively for active/selected/achievement states — never decorative
  glow: (hex: string) => `shadow-[0_0_20px_${hex}40]`,
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

export function getAccentColor(accent: SemanticColor | string | null | undefined): string | undefined {
  if (!accent) return undefined;
  if (accent in SEMANTIC_COLORS) {
    return SEMANTIC_COLORS[accent as keyof typeof SEMANTIC_COLORS];
  }
  if (accent in WORKOUT_COLORS) {
    return WORKOUT_COLORS[accent as WorkoutType]; // fallback to workout-type palette
  }
  if (accent.startsWith('#') || accent.startsWith('rgb')) {
    return accent;
  }
  return undefined;
}

export const TYPOGRAPHY = {
  eyebrow: 'font-mono text-[9px] uppercase tracking-[0.25em] font-bold',
  titlePage: 'font-display text-3xl uppercase tracking-tight text-white leading-none',
  titleSection: 'font-display text-2xl uppercase tracking-tight text-white leading-none',
  titleSubsection: 'font-display text-lg uppercase tracking-wide text-white leading-none',
  body: 'font-sans text-sm text-zinc-400 leading-relaxed',
  statNumber: 'font-display text-3xl uppercase tracking-tight text-white leading-none',
  statNumberHero: 'font-display text-4xl sm:text-5xl uppercase tracking-tight text-white leading-none',
  label: 'font-mono text-[10px] text-zinc-400 uppercase tracking-wider font-bold',
} as const;
