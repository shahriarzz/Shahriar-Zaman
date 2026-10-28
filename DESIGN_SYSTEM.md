# DESIGN_SYSTEM.md — GAINLOG Visual Language & UI Contract

> **Status:** Active operating contract with automated invariant checks (rules are enforced incrementally across test suites and code reviews)  
> **Audience:** AI coding agents and contributors  
> **Scope:** `src/styles/tokens.ts`, `src/components/ui/`, and visual/layout code in screen components  
> **Product intent:** A compact, fast, data-driven strength-training tool. The interface should make planning, logging, analysis, and progress easier—not compete for attention.

---

## 1. Product principle: clarity over decoration

GAINLOG is a training tool, not a generic lifestyle or gamification app. Its visual language should feel restrained, precise, compact, and consistent.

Use this decision order:

1. **Comprehension:** Can the lifter understand the information or action immediately?
2. **Hierarchy:** Is the most important number, state, or action visually obvious?
3. **Density:** Can the screen show the information needed without wasteful padding or repeated cards?
4. **Consistency:** Can an existing token or primitive express it?
5. **Decoration:** Add visual treatment only when it communicates meaning.

### Default visual behavior

- Use a dark, neutral canvas; subtle surface separation; restrained borders; and a small semantic accent palette.
- Prefer typography, alignment, spacing, and a clear information hierarchy over gradients, shadows, glow, large icons, and decorative containers.
- Treat data as the visual focus. Use tabular numerals for comparable numeric values and align related values consistently.
- Keep routine logging fast: avoid unnecessary transitions, confirmations, labels, cards, and taps.
- Do not repeat the same metric in multiple places unless each occurrence serves a distinct workflow.
- Avoid “dashboard inflation”: more cards or colors do not automatically make information clearer.
- Preserve established interaction patterns and data behavior when making visual changes.

**Aesthetic test:** If removing an effect, container, icon, or animation does not reduce comprehension, state recognition, or usability, prefer removing it.

---

## 2. Source of truth and change discipline

Before adding a token, color, component, style value, or visual pattern:

1. Search this document.
2. Inspect `src/styles/tokens.ts` and `src/components/ui/`.
3. Find existing usages and confirm the token's real meaning.
4. Reuse or extend an existing token when the semantic role is the same.
5. Propose a new token or primitive only when a real, distinct need remains.

Do not create same-value aliases, parallel component systems, or one-off utility combinations just to make a local change easier. Conversely, do not force unrelated meanings into one token merely because their current values happen to match.

This document describes the **intended contract**, not proof that every existing component currently complies. When documenting implementation facts, verify them in source. When a conflict is found, report it instead of silently claiming the code already follows the rule.

For UI work, follow `AGENTS.md`'s mandatory reading order: `AGENTS.md` → relevant `ARCHITECTURE.md` sections → relevant `DATA_MODEL.md` sections → relevant `PRD.md` sections → relevant implementation and tests. Read `security_spec.md` when the task touches data, authentication, or sync. Follow the project's stop-and-approve gate for high-risk work.

---

## 3. Color

### 3.1 Semantic colors

Use semantic colors for meaning, not decoration. Resolve semantic colors through `getAccentColor()` or the relevant exported token when the API supports it. For Tailwind styles, use the approved semantic classes already used by the token system. For SVG/chart APIs that require raw values, use `CHART_THEME` or `SEMANTIC_COLORS`; do not retype hex values in components.

| Semantic token | Current source value | Meaning | Typical use |
|---|---|---|---|
| `orange` | `#f97316` | Brand, primary action, achievement | Primary actions, selected state, PRs and milestones |
| `emerald` | `#10b981` | Success and approved data visualization | Success feedback, analytics where this color has a defined role |
| `amber` | `#f59e0b` | Warning, caution, partial state | Warnings and incomplete states |
| `red` | `#ef4444` | Destructive, error, failure, missed state | Destructive actions and error states |
| `indigo` | `#6366f1` | Training intelligence and strength-trend analysis | Narrowly scoped intelligence/strength-trend visuals |
| `zinc` | `#71717a` | Neutral, unclassified, placeholder | Neutral indicators and supporting structure |

These values are transcribed from `SEMANTIC_COLORS` in `src/styles/tokens.ts`; if source changes, update this table in the same authorized change.

### 3.2 Workout-type colors are a different semantic system

`WORKOUT_COLORS` in `src/utils/fitnessHelpers.ts` represents workout identity. Use it only when a color specifically identifies a workout type (for example, a workout marker or type badge). Do not use workout colors to style unrelated buttons, alerts, charts, or general interface elements.

Current mapping:

| Workout type | Current value |
|---|---|
| `push` | `#facc15` |
| `pull` | `#38bdf8` |
| `hybrid` | `#c026d3` |
| `rest` | `#22c55e` |
| `date` | `#f43f8e` |
| `upper` | `#fb923c` |
| `lower` | `#84cc16` |
| `custom` | `#a78bfa` |

Use `WorkoutColorIndicator` where appropriate instead of inventing another workout-type marker. Unknown-type fallbacks resolve consistently to neutral zinc (`#71717a` / `UNKNOWN_WORKOUT_COLOR`), never to amber or push.

### 3.3 Color rules

- Neutral is the default. Accent colors should be infrequent and carry meaning.
- Do not rely on color alone to communicate status; include a label, icon, shape, or other understandable cue where needed.
- Do not use red/green alone to distinguish values or states.
- Avoid introducing new Tailwind hue families for one-off emphasis. Check the semantic palette and workout-type palette first.
- Do not assume every chart needs a different color. Use a restrained, consistent series palette and reserve emphasis for the series or event that matters.
- Gradients and glow are not default surface treatments. Use them only where an existing, explicit state or component contract requires them.
- Avoid arbitrary opacity variants and raw hex literals scattered through components. Exceptions must be narrow, justified by the API, and documented.
- Verify text and interactive-state contrast, especially for small text, muted labels, chart annotations, and translucent surfaces.

**Implementation note:** `getAccentColor()` can resolve both semantic tokens and workout types. That capability does not mean the two palettes are interchangeable; callers must choose the correct semantic domain.

---

## 4. Typography and information hierarchy

Use the canonical entries in `TYPOGRAPHY` from `src/styles/tokens.ts`. Do not copy class strings into components when an existing token already expresses the role.

Current token groups include:

- **Headings:** `eyebrow`, `titlePage`, `titleSection`, `titleSubsection`, `cardTitle`
- **Metrics:** `label`, `unit`, `cardValue`, `statValue`, `statValueHero`
- **Body/support:** `body`, `bodySecondary`, `metadata`, `caption`, `micro`
- **Controls:** `buttonSm`, `button`, `badgeSm`, `badgeMd`, `segmentedSm`, `segmentedMd`, `dialogFooter`, `helperText`, `errorText`, `successText`, `navLabel`
- **Lists and empty states:** `listValue`, `listLabel`, `emptyTitle`, `emptyDescription`

The token names and definitions in source are authoritative. Do not invent names such as `buttonLabel`, `formLabel`, or `bodyTertiary` unless a real semantic gap is demonstrated and approved.

### Readable typography floors by role

To preserve comfort and legibility across high-density mobile screens:
- **Absolute floor (9px):** `TYPOGRAPHY.micro` (`text-[9px]`) and `TYPOGRAPHY.badgeSm` (`text-[9px]`) are the lowest permitted font sizes in the app, strictly reserved for micro-badges, tertiary status tags, and compact category tags.
- **Secondary metadata floor (10px):** `eyebrow`, `label`, `caption`, `metadata`, `helperText`, `dialogFooter`, and `navLabel` use `text-[10px]`.
- **Interactive control floor (11px / 12px):** `buttonSm` (`text-[11px]`), `button` (`text-xs` / 12px), `segmentedSm` (`text-[10px]`), and `segmentedMd` (`text-xs`).
- **Prohibited:** No typography token or inline text may use `text-[8px]` or below.

### Typography rules

- Use display typography for hierarchy, not for every label.
- Use monospace where it improves scanning of metrics, timestamps, labels, or aligned values—not as a blanket requirement for all text.
- Use `tabular-nums` for changing or comparable numbers where alignment matters.
- Avoid excessive uppercase and letter spacing in long labels, instructions, helper text, and content users must read continuously.
- Keep supporting text visibly secondary but comfortably readable. Do not shrink important content merely to make a screen look denser.
- Let hierarchy come from a small number of clear levels; do not introduce near-identical styles for every component.
- Text must wrap or truncate intentionally on narrow screens. Do not allow long exercise names, values, or buttons to break layouts.

---

## 5. Spacing, layout, surfaces, and borders

### 5.1 Existing spatial tokens

Use the existing exports in `src/styles/tokens.ts`:

- `SPACING`: intent-based padding utilities (`none`, `compact`, `standard`, `section`, `hero`) plus component-specific entries such as badge and segmented-control padding.
- `GAP`: horizontal/grid gap scale (`none`, `micro`, `xs`, `sm`, `md`, `lg`, `xl`, `2xl`).
- `STACK_SPACING`: vertical rhythm scale with corresponding size names.
- `RADIUS`: `badge`, `button`, `card`, `panel`, `pill`.
- `CONTROL_HEIGHT`: canonical height contract for interactive controls:
  - `sm`: `min-h-[32px] h-8` (compact inputs, secondary buttons)
  - `md`: `min-h-[40px] h-10` (standard inputs, default buttons)
  - `lg`: `min-h-[48px] h-12` (prominent actions, hero controls)
  - `touchTarget`: `min-h-[44px] min-w-[44px]` (accessible mobile tap boundary)
- `ICON_SIZE`, `NAV`, and `EDITOR_HEADER`: use where their existing scope fits.
- `SURFACE`, `BORDER`, and `SHADOW`: standard surface, border, and elevation choices.

Do not add another spacing or radius scale without proving the current system cannot express the requirement. A token's actual exported name and value in source takes precedence over a paraphrase in this document.

### 5.2 Density rules

- Prefer compact layouts that preserve readability and touch usability.
- Use consistent alignment and spacing within a screen; do not pad every nested container independently.
- Avoid cards inside cards unless the nested surface communicates a real grouping or interaction boundary.
- Use borders and surface contrast before adding shadows or glow.
- Reserve the largest padding and strongest surface treatment for genuinely prominent content, not ordinary metrics or every section.
- Do not add whitespace solely to make a screen feel “premium”; whitespace must support grouping and scanning.
- Use responsive layout changes to preserve hierarchy on mobile, not simply scale a desktop composition down.

### 5.3 Radius and elevation

- Reuse `RADIUS` role tokens rather than inventing arbitrary rounded values.
- **Card surface discipline:** Standard cards (`variant="standard"`) do not receive default box shadows (`SHADOW.elevation`). Surfaces are separated by border (`BORDER.standard`) and background (`SURFACE.default` / `SURFACE.subtle`).
- Keep elevation levels limited. Elevation (`SHADOW.elevation`) is reserved for genuinely elevated surfaces (`variant="elevated"`, `Dialog`).
- Use `SHADOW.accentGlowStyle` / `accentVariant="glow"` only for explicitly selected, active, or achievement states, consistent with its source comment.
- Do not introduce new decorative halos, gradients, blur, or glass effects as routine card styling.

### 5.4 Touch targets

The canonical `CONTROL_HEIGHT` establishes `min-h-[32px]` (sm), `min-h-[40px]` (md), and `min-h-[48px]` (lg), alongside `CONTROL_HEIGHT.touchTarget` (`min-h-[44px] min-w-[44px]`). On mobile, aim for a **44 × 44 CSS-pixel minimum interactive target where practical**, especially for primary actions, navigation items, and icon-only controls. Compact visual controls may retain a 32px or 40px visual boundary while expanding their hit region using hit-padding or touchTarget containers. Any deliberate exception to the 44px hit-target policy or raw-color rules requires an explicit architectural reason and automated test coverage. Do not reduce touch targets merely to increase density.

---

## 6. Motion and interaction

### 6.1 Use the real motion API

The token module exports `DURATION`, `TRANSITION`, and `MOTION_CONFIG`. `MOTION_CONFIG` is the sole canonical preset object in `src/styles/tokens.ts` (`entrance`, `viewEntrance`, `dialogSurface`, `calendarPanel`, `collapse`, `pulseSubtle`, `staggerDelay`). Do not introduce secondary alias objects.

`TRANSITION` provides property-specific CSS transitions coupled with `motion-reduce:transition-none`; prefer these over untargeted `transition-all`. For Framer Motion components, always inspect reduced-motion preference via `useReducedMotion()` from `motion/react` to provide a zero-motion or static alternative for users who prefer reduced motion.

### 6.2 Motion rules

- Motion must communicate a state change, preserve spatial context, or provide useful interaction feedback.
- No decorative looping motion, idle floating, shimmer, or pulsing just to make a static screen feel alive.
- Prefer subtle, short transitions. Avoid delaying logging, navigation, or feedback for an animation.
- Respect `prefers-reduced-motion`; use the existing reduced-motion utilities and ensure motion-library animations also have an appropriate reduced-motion path.
- Do not animate large sections on every render or add staggered entrances to ordinary data lists without a clear usability benefit.
- Chart animation should be deliberate and restrained. Disable it where it delays reading, causes repeated visual noise, or harms performance.
- Use the established `MOTION_CONFIG` presets where appropriate rather than adding inline variants with slightly different timings.
- Interaction states must remain clear without motion: hover, pressed, selected, disabled, loading, success, and error should have visible non-animated cues.

**Current implementation caveat:** The existing token set contains more motion presets than every screen necessarily needs. Their existence is not a requirement to animate every component.

---

## 7. Shared UI primitives

Use and extend existing primitives before creating alternatives. The current `src/components/ui/index.ts` exports include:

| Primitive/helper | Contract |
|---|---|
| `Card` | Shared surface, border, radius, padding, and state/accent styling (`standard`, `elevated`, `interactive`, `recessed`, `selected`, `warning`, `destructive` variants; no default elevation on standard) |
| `Section` | Card-based section composition with optional `SectionHeader` |
| `SectionHeader` | Reusable section heading, supporting description, and action |
| `StatCard` | Compact metric presentation |
| `AchievementCard` | Achievement/record-specific presentation; keep its role narrow |
| `Badge` | Compact status or category label |
| `Button` | Standardized button variants, sizes (`sm`, `md`, `lg`, `icon` at 44px min), focus/disabled states |
| `Input`, `Textarea` | Shared text-entry controls |
| `Banner` | Inline notice/alert variants (non-elevated by default; distinct semantic borders & subtle fills; no gradients or ping dots) |
| `Dialog` | Modal dialog surface with explicit accessible naming (`ariaLabel` / `aria-labelledby`) and focus trap |
| `EmptyState` | Shared no-content or no-results treatment |
| `SegmentedControl` | Compact choice among a small set of options; not a universal replacement for every tab/navigation pattern |
| `Grid`, `Stack` | Shared layout composition |
| `ListRow` | Repeated list-row pattern |
| `ChartTooltip` | Shared Recharts tooltip styling |
| `WorkoutColorIndicator` | Workout-type color marker |
| `Toast` | Transient feedback |
| `ErrorFallback` | Error-boundary fallback |
| `renderIcon` | Shared icon resolution helper |

Confirm the current exports and prop contracts before relying on this list. Do not add a second primitive for the same responsibility.

### 7.1 Component boundaries

- Primitives should own reusable presentation and interaction patterns, not domain calculations.
- Keep training calculations and business rules in their canonical utility/context layers; UI components consume their results.
- Prefer explicit, small variant APIs over arbitrary color overrides and many overlapping variants.
- Avoid creating a primitive for a single one-off use. A repeated pattern in two places is a signal to investigate—not automatic proof that abstraction is needed.
- Do not build a component solely to wrap another component without reducing duplication or clarifying a contract.
- Do not introduce external UI libraries without explicit approval.

### 7.2 Do not assume a primitive is unnecessary

A local-first app may still need loading, error, empty, offline, sync, and pending states. Do not reject a `Skeleton`, `Tabs`, drawer, or other pattern solely because it is absent today or because local reads are synchronous. First establish the real workflow and whether an existing primitive covers it. Add nothing speculatively, but do not forbid a justified requirement in advance.

---

## 8. Accessibility and responsive behavior

- Preserve semantic HTML and correct heading hierarchy.
- Every interactive control must be keyboard-operable, have a visible focus state, and expose an accessible name.
- Icon-only controls require an accessible label; do not rely on tooltip text alone.
- Keep focus visible and never remove outlines without an equivalent replacement.
- Provide non-color cues for selected, error, success, and workout-type states.
- Respect reduced motion and avoid interactions that require hover alone.
- Maintain readable contrast and text sizes, especially for micro-labels and muted text. Compact is not a reason to make essential information illegible.
- Ensure layouts work at narrow mobile widths, browser zoom, and large text settings where feasible.
- Do not use color, animation, or haptics as the only feedback for a meaningful state change.
- Preserve hit areas and spacing for controls used while training, including when users are moving quickly between sets.

---

## 9. Data visualization

Charts exist to explain training history and trends, not decorate the dashboard.

- Reuse `CHART_THEME` and existing `ChartTooltip` patterns.
- Give series colors stable meanings within a chart; avoid arbitrary palette changes between screens.
- Use direct labels, legends, units, and date ranges when they materially help interpretation.
- Keep gridlines and axes visually subordinate to the data.
- Avoid 3D charts, unnecessary gradients, heavy borders, excessive gridlines, and animation that delays interpretation.
- Use a clear empty state when data is unavailable; do not imply zero when the correct state is unknown or not applicable.
- Ensure charts remain interpretable without color alone and test tooltips/legends on touch devices.
- Do not duplicate or recalculate domain metrics inside chart components. Consume canonical derived values.

---

## 10. Adding or changing tokens and primitives

Before implementation, identify the existing token/component and explain why it is insufficient.

### Add a token only when

- It represents a distinct semantic role or a real, repeated visual need.
- It cannot be expressed cleanly by extending an existing token.
- Its name communicates intent rather than merely its current numeric value.
- It has been checked against existing tokens and documented semantic aliases.
- All relevant consumers and tests are updated.

### Add a primitive only when

1. A real repeated pattern exists or a meaningful shared interaction contract is required.
2. No existing primitive can be extended cleanly.
3. The proposed API remains narrow and semantic.
4. It consumes existing tokens and preserves accessibility.
5. It is exported through `src/components/ui/index.ts`.
6. This document and relevant tests are updated in the same change.
7. Any primitive it fully replaces is removed in the same change.

### For visual refactors

- Avoid unrelated changes to routine progression, workout logging, persistence, sync, muscle attribution, recovery, or analytics calculations.
- Keep changes scoped and reviewable.
- Check all affected callers and screen states, not only the component being edited.
- Do not claim a visual fix is verified without running available checks and inspecting the relevant screens where possible.

---

## 11. Enforcement and review checklist

Before completing UI work, verify:

- [ ] Existing tokens and primitives were searched before adding alternatives.
- [ ] No arbitrary colors, radius values, spacing values, typography styles, or motion presets were introduced without justification.
- [ ] The change improves clarity, hierarchy, density, or usability—not decoration alone.
- [ ] Accent colors and effects are restrained and semantically meaningful.
- [ ] Mobile layout, touch targets, focus states, contrast, and reduced motion were considered.
- [ ] Loading, empty, error, disabled, selected, and success states remain coherent where applicable.
- [ ] Shared components and all relevant consumers use consistent behavior.
- [ ] Data visualization uses canonical derived values and established chart tokens.
- [ ] Tests, lint/type checks, and build were run where available; actual results are reported.
- [ ] Documentation and tests were updated when the contract changed.

**Final standard:** GAINLOG should feel quiet until information or action matters. The interface earns attention through useful data, clear hierarchy, and reliable interaction—not through decoration.
