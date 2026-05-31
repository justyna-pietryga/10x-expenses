<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Monthly Summary and Reusable Rules

- **Plan**: `context/changes/monthly-summary-and-rules/plan.md`
- **Mode**: Deep
- **Date**: 2026-05-31
- **Verdict**: REVISE
- **Findings**: 1 critical, 1 warning, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | FAIL |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding

Grounding: 5/5 paths ✓, 3/3 symbols ✓, brief↔plan ✓

## Findings

### F1 — Users cannot actually mark a category as savings

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 1 `Savings Category Marker`, Phase 2 `Category Helper Extension`, Phase 3 dashboard UI
- **Detail**: The plan makes savings carry-over a core S-03 behavior, but it never gives the user a way to set `carryover_enabled`. Today category creation/editing only handles `name` and `percentage_limit` in `src/components/budget/CategoryManager.tsx`, `src/lib/budget/validation.ts`, `src/pages/api/budget/categories/index.ts`, and `src/pages/api/budget/categories/[id].ts`. Extending only `src/lib/budget/data.ts` is not enough, so the desired end state cannot be reached from the UI.
- **Fix**: Add the savings-category toggle to the S-03 plan explicitly across the full category flow: validation, budget category API routes, `BudgetCategory` helpers, and the `/budget` category manager UI.
- **Decision**: FIXED

### F2 — Carry-over source of truth is internally inconsistent

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: `Savings Carry-Over Contract`, `Cached Snapshot Role`, Phase 2 `Summary Domain Module`
- **Detail**: The plan says carry-over should be “derived from prior months’ reviewed summaries,” but it also says `monthly_summaries` is only a cache and not the source of truth. Those two statements conflict. If carry-over reads prior cached summaries, later month totals can go stale after an older month’s income/category/reviewed transactions change. The plan never chooses whether carry-over is recomputed from live historical data or from a refreshed month-by-month snapshot chain.
- **Fix A ⭐ Recommended**: Derive carry-over from live historical source tables.
  - Strength: Keeps finance math correct even when older months change and stays consistent with “snapshot is cache only.”
  - Tradeoff: More summary computation work per request, especially when walking across several prior months.
  - Confidence: HIGH — the current plan already prefers live recomputation on load, so this aligns with its stated source-of-truth model.
  - Blind spot: We have not measured how many prior months users will commonly traverse in one request.
- **Fix B**: Make `monthly_summaries` the authoritative carry-over chain.
  - Strength: Faster reads and simpler per-request computation once snapshots are valid.
  - Tradeoff: Requires invalidation/rebuild logic whenever older month inputs change, which is broader than the current plan admits.
  - Confidence: MEDIUM — workable, but it changes the plan’s current caching stance and broadens blast radius.
  - Blind spot: No rebuild strategy is specified yet for backdated edits.
- **Decision**: FIXED via Fix A
