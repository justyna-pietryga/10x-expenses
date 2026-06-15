# Full-Width Dashboard Panels Implementation Plan

## Overview

Implement `UX-08` by expanding the authenticated workspace shell used by the dashboard and related management surfaces so desktop users can see more information at once. The first cut will cover `/dashboard`, `/budget`, and `/imports`, with wider desktop containers, selective panel rearrangement where it clearly improves density, and preserved inner copy constraints for readability.

## Current State Analysis

The current authenticated pages already share a strong visual pattern, but each route hard-codes its own `max-w-*` shell. The dashboard and imports pages cap at `max-w-7xl`, while budget is narrower at `max-w-6xl`, which leaves visible unused horizontal space on large displays even though the underlying panels already support denser data presentation.

The dashboard workspace is mostly a stack of full-width sections, so widening is primarily a layout-contract task rather than a data or state rewrite. Budget and import surfaces also already support responsive internal layouts, which means the main planning risk is inconsistent shell behavior or over-widened copy, not functional regressions.

## Desired End State

Desktop users on `/dashboard`, `/budget`, and `/imports` see a visibly wider authenticated workspace that uses more of the available screen without becoming edge-to-edge. Data-heavy panels, cards, tables, and management sections gain horizontal room, while descriptive copy blocks and headers remain intentionally constrained for readability.

### Key Discoveries:

- [src/pages/dashboard.astro:37](src/pages/dashboard.astro:37) constrains the entire dashboard inside `mx-auto max-w-7xl`.
- [src/pages/budget.astro:33](src/pages/budget.astro:33) uses an even narrower `max-w-6xl`, making the budget management surface the most cramped of the three target routes.
- [src/pages/imports.astro:68](src/pages/imports.astro:68) uses the same shell width as dashboard, so a shared authenticated workspace wrapper is viable across all three routes.
- [src/components/dashboard/SummaryWorkspace.tsx:161](src/components/dashboard/SummaryWorkspace.tsx:161) already renders stacked full-width sections, so widening can happen without changing dashboard data contracts.
- [src/components/dashboard/MonthlySummaryHeader.tsx:27](src/components/dashboard/MonthlySummaryHeader.tsx:27), [src/pages/budget.astro:46](src/pages/budget.astro:46), and [src/pages/imports.astro:81](src/pages/imports.astro:81) already constrain narrative copy, which should be preserved even when the page shell gets wider.

## What We're NOT Doing

- Rebuilding dashboard information architecture into a new desktop-only multi-pane product.
- Changing business logic, API responses, or persisted data.
- Introducing a new tablet-first two-column behavior.
- Making authenticated pages fully fluid or edge-to-edge on ultra-wide monitors.
- Refactoring unrelated public/auth routes to share the same shell.

## Implementation Approach

Introduce a reusable authenticated workspace width contract, then adopt it in `/dashboard`, `/budget`, and `/imports`. Use that wider shell only at large desktop breakpoints, preserve current mobile and tablet stacking, and allow a small number of internal layout upgrades only where the extra width would otherwise go unused.

## Critical Implementation Details

### User experience spec

The widened shell should make data-heavy regions feel less cramped, but narrative copy should not become full-panel width. The implementation should widen the workspace and selected panel structures while retaining `max-w-*` constraints on descriptive text blocks and similar reading-oriented content.

## Phase 1: Shared Authenticated Workspace Width Contract

### Overview

Create a shared layout contract for authenticated product pages so desktop width is standardized instead of hand-tuned per route.

### Changes Required:

#### 1. Authenticated page shells

**File**: `src/pages/dashboard.astro`

**Intent**: Replace the route-local width wrapper with a shared, wider desktop shell contract so the dashboard is no longer capped by the current `max-w-7xl` container.

**Contract**: The page continues to render `Topbar` and the main glass section in the same order, but the outer workspace wrapper must move to a shared width policy that can also be adopted by budget and imports.

**File**: `src/pages/budget.astro`

**Intent**: Bring the budget setup route onto the same authenticated workspace shell instead of keeping a narrower one-off width cap.

**Contract**: The route keeps the existing hero, month switcher, and `BudgetSetup` mount point, but uses the same outer width contract as dashboard and imports.

**File**: `src/pages/imports.astro`

**Intent**: Adopt the shared workspace shell so the import review route participates in the same desktop width system as the dashboard and budget management surfaces.

**Contract**: The route preserves its top-level structure and import-review semantics while replacing the route-local container width with the shared authenticated workspace width contract.

**File**: `src/layouts/Layout.astro` or a new shared layout/helper under `src/components/` or `src/layouts/`

**Intent**: Centralize the authenticated workspace shell so future protected routes can reuse the same width policy instead of duplicating `max-w-*` wrappers.

**Contract**: Provide a reusable wrapper or helper that encapsulates the chosen desktop width cap and standard page padding without changing public/auth page behavior.

### Success Criteria:

#### Automated Verification:

- Type and Astro checks pass: `npm run check`
- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- On a large desktop viewport, `/dashboard`, `/budget`, and `/imports` all visibly use a wider shared shell than before.
- On mobile and tablet widths, the page shell still collapses cleanly without horizontal scrolling.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Dashboard And Budget Panel Width Behavior

### Overview

Use the new desktop shell to improve panel-level density on dashboard and budget pages without sacrificing readability.

### Changes Required:

#### 1. Dashboard header and summary surfaces

**File**: `src/components/dashboard/MonthlySummaryHeader.tsx`

**Intent**: Keep dashboard copy readable inside the wider shell and let controls align more naturally across the extra horizontal space.

**Contract**: Preserve the current month selector and quick month buttons, but keep descriptive copy constrained while allowing the overall header region to benefit from the expanded shell.

**File**: `src/components/dashboard/SummaryWorkspace.tsx`

**Intent**: Use the wider desktop shell intentionally, including low-risk section arrangement improvements where stacked full-width sections would otherwise leave obvious unused space.

**Contract**: The component keeps the same data flow and child components, but may introduce limited desktop-only grouping or distribution changes for cards and panels so the wider shell results in more useful density, not just more padding.

**File**: `src/components/dashboard/SummaryCards.tsx`

**Intent**: Confirm the KPI cards scale appropriately inside the wider layout and continue to distribute cleanly at desktop widths.

**Contract**: Card content and metrics stay unchanged, but the grid should remain balanced within the widened shell and any adjacent desktop grouping introduced in `SummaryWorkspace`.

#### 2. Budget management readability and density

**File**: `src/components/budget/BudgetSetup.tsx`

**Intent**: Preserve the current income-first flow while allowing wider desktop spacing and more balanced distribution between budget management sections.

**Contract**: `IncomeForm` and `CategoryManager` remain the two core surfaces, but their surrounding layout may be adjusted to use desktop width more effectively while preserving current stacking on smaller breakpoints.

**File**: `src/components/budget/CategoryManager.tsx`

**Intent**: Ensure the denser category-management surface from `UX-03` benefits from the wider shell without stretching text or controls into hard-to-scan rows.

**Contract**: Existing create/edit/archive flows remain unchanged; any width-related changes stay presentational and keep copy or form fields within readable bounds.

**File**: `src/components/rules/RuleManager.tsx`

**Intent**: Keep the reusable-rule panel aligned with the new desktop shell and preserve readable rule descriptions inside wider panel space.

**Contract**: Rule CRUD behavior stays identical; width-related changes are limited to layout and readability constraints.

### Success Criteria:

#### Automated Verification:

- Type and Astro checks pass: `npm run check`
- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- Dashboard summary panels and cards show more usable horizontal density on desktop without turning descriptive copy into very long lines.
- Budget category and rule management surfaces feel wider and less cramped on desktop while retaining the existing single-column behavior on tablet/mobile.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Import Workspace Adoption And Regression Guardrails

### Overview

Adopt the shared shell in the import workflow and verify that wider desktop space does not break the existing review/history interactions.

### Changes Required:

#### 1. Import workspace layout adoption

**File**: `src/components/imports/ImportWorkspace.tsx`

**Intent**: Make sure the widened route shell translates into a better desktop review workspace without changing import-review behavior.

**Contract**: The history panel, upload form, completion bar, review table, and switch dialog keep their current functional behavior. Any layout changes remain limited to desktop spacing or distribution that complements the wider route shell.

**File**: `src/pages/imports.astro`

**Intent**: Preserve the import hero and status summary while keeping narrative copy constrained inside the wider authenticated workspace shell.

**Contract**: The route continues to render the existing hero copy and status cards, but applies the shared desktop width contract and retains readable `max-w-*` constraints for prose.

#### 2. Layout verification coverage

**File**: `src/` test files near the affected surfaces or existing test locations

**Intent**: Add or update lightweight verification where practical so layout-contract changes on protected routes are less likely to regress silently.

**Contract**: Prefer assertions that protect the presence or usage of shared shell classes/structure rather than brittle pixel assumptions. If current test infrastructure is not a good fit for layout assertions, keep automated coverage at lint/check/build and rely on documented manual viewport verification.

### Success Criteria:

#### Automated Verification:

- Type and Astro checks pass: `npm run check`
- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- `/imports` uses the same wider authenticated shell as `/dashboard` and `/budget` on large desktop viewports.
- Import history, upload, review table, and batch-switch dialog still behave correctly after the layout change.
- No target route introduces horizontal overflow at common mobile, tablet, laptop, or large-desktop widths.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- If a reusable authenticated shell helper/component is introduced, add focused tests for its class or structural contract where the current test stack supports it.
- If any layout grouping logic is introduced in React components, test the rendering branch rather than CSS side effects.

### Integration Tests:

- Run the existing repo-wide validation gates to catch Astro/React composition regressions across the three protected routes.
- Add route-structure assertions only if there is already a stable testing pattern for those pages.

### Manual Testing Steps:

1. Open `/dashboard` at mobile, tablet, standard laptop, and large desktop widths and confirm the shell widens only at desktop while copy remains readable.
2. Open `/budget` at the same widths and confirm income/category/rule surfaces use more desktop width without layout breakage.
3. Open `/imports`, verify upload/history/review flows still render cleanly, and confirm the history sidebar and review table benefit from the wider shell on desktop.
4. Spot-check ultra-wide desktop behavior to ensure panels are wider but not effectively edge-to-edge.

## Performance Considerations

This change should stay CSS/layout-only. Avoid introducing client-side measurement, resize observers, or viewport-driven state unless a specific component absolutely requires it. The preferred solution is static responsive classes and shared shell structure.

## Migration Notes

No data migration is required. If a new shared shell helper or wrapper is introduced, the migration is purely structural: route pages adopt the shared width contract incrementally without changing business logic.

## References

- Roadmap slice: `context/foundation/roadmap.md`
- Prior framing for dense management surfaces: `context/changes/import-review-workflow-enhancements/frame.md`
- Dashboard route shell: `src/pages/dashboard.astro:37`
- Budget route shell: `src/pages/budget.astro:33`
- Imports route shell: `src/pages/imports.astro:68`
- Dashboard header copy constraint: `src/components/dashboard/MonthlySummaryHeader.tsx:27`
- Dashboard workspace composition: `src/components/dashboard/SummaryWorkspace.tsx:161`
- Category manager density baseline: `src/components/budget/CategoryManager.tsx:147`
- Rule manager density baseline: `src/components/rules/RuleManager.tsx:42`
- Import workspace desktop split: `src/components/imports/ImportWorkspace.tsx:411`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Shared Authenticated Workspace Width Contract

#### Automated

- [x] 1.1 Type and Astro checks pass: `npm run check` — 042ba4d
- [x] 1.2 Linting passes: `npm run lint` — 042ba4d
- [x] 1.3 Production build passes: `npm run build` — 042ba4d

#### Manual

- [x] 1.4 On a large desktop viewport, `/dashboard`, `/budget`, and `/imports` all visibly use a wider shared shell than before. — 042ba4d
- [x] 1.5 On mobile and tablet widths, the page shell still collapses cleanly without horizontal scrolling. — 042ba4d

### Phase 2: Dashboard And Budget Panel Width Behavior

#### Automated

- [x] 2.1 Type and Astro checks pass: `npm run check` â€” 50607bb
- [x] 2.2 Linting passes: `npm run lint` â€” 50607bb
- [x] 2.3 Production build passes: `npm run build` â€” 50607bb

#### Manual

- [x] 2.4 Dashboard summary panels and cards show more usable horizontal density on desktop without turning descriptive copy into very long lines. â€” 50607bb
- [x] 2.5 Budget category and rule management surfaces feel wider and less cramped on desktop while retaining the existing single-column behavior on tablet/mobile. â€” 50607bb

### Phase 3: Import Workspace Adoption And Regression Guardrails

#### Automated

- [x] 3.1 Type and Astro checks pass: `npm run check` — c393175
- [x] 3.2 Linting passes: `npm run lint` — c393175
- [x] 3.3 Production build passes: `npm run build` — c393175

#### Manual

- [x] 3.4 `/imports` uses the same wider authenticated shell as `/dashboard` and `/budget` on large desktop viewports. — c393175
- [x] 3.5 Import history, upload, review table, and batch-switch dialog still behave correctly after the layout change. — c393175
- [x] 3.6 No target route introduces horizontal overflow at common mobile, tablet, laptop, or large-desktop widths. — c393175
