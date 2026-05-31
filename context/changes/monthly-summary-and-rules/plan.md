# Monthly Summary and Reusable Rules Implementation Plan

## Overview

Build S-03 from the roadmap: a signed-in user can open the protected dashboard, move across imported months, see a selected month's budget usage against income and category limits, understand which spend is still incomplete because review is not finished, and create or manage reusable categorization rules with explicit matching semantics.

## Current State Analysis

The project already has the domain tables needed to support this slice: `monthly_incomes`, `budget_categories`, `categorization_rules`, `transactions`, `statement_import_batches`, and `monthly_summaries` all exist with per-user RLS in `supabase/migrations/20260526103000_finance_domain_foundation.sql`. S-01 added month-based income and category setup on `/budget`, while S-02 added the protected `/imports` workspace, persisted review-complete state on import batches, and a narrow rule-creation path that currently saves a recipient-based substring rule.

What is still missing is the actual north-star budgeting loop:

- `/dashboard` is still a placeholder and does not load any finance data.
- `monthly_summaries` exists but is unused.
- Rule semantics are too narrow for the intended user experience: only one text value is stored, and matching is hard-coded against `recipient + title`.
- The model has no way to represent the PRD's carry-over behavior for savings-style categories.
- Summary trust boundaries do not exist yet, so there is no user-facing distinction between reviewed and incomplete imported data.

### Key Discoveries

- The roadmap defines S-03 as the first full proof-of-value slice and makes it the north star: `context/foundation/roadmap.md:16`, `context/foundation/roadmap.md:91`.
- The PRD makes summary usage against income and reusable rules must-haves in the same user story: `context/foundation/prd.md:23`, `context/foundation/prd.md:97`, `context/foundation/prd.md:99`.
- The current rule engine in `src/lib/imports/data.ts` applies rules by substring matching against a combined `recipient + title` candidate and saves new rules from `transaction.recipient`, which is too implicit for the next slice.
- `/budget` already uses a month query parameter plus a native `<input type="month">`, which is a strong existing pattern for S-03 month switching: `src/pages/budget.astro`.
- `/dashboard` is already protected and linked in the topbar, but is currently just a placeholder, making it the most natural summary surface instead of adding another top-level route: `src/pages/dashboard.astro`, `src/components/Topbar.astro`, `src/middleware.ts`.
- The current import contract already distinguishes `review_completed_at` from merely persisted imports, which gives S-03 a solid trust boundary to build on: `src/lib/imports/data.ts`, `src/pages/imports.astro`.
- `monthly_summaries` exists with `summary_snapshot`, `total_income`, `total_spent`, and `generated_at`, which is a strong fit for cached-on-load snapshots rather than a pure live-only computation path: `src/lib/database.types.ts`.
- Accepted lessons already push us toward roadmap-ID commit scopes and explicit, step-by-step manual verification wording: `context/foundation/lessons.md`.

## Desired End State

A signed-in user opens `/dashboard` and lands on the latest imported month by default. They can switch to other available months using a month picker or month-history control. For the selected month, the dashboard shows:

- total income,
- total spend,
- per-category spend,
- percent-of-income usage,
- category limit usage,
- savings carry-over balances for categories explicitly marked as savings,
- and a clearly separated incomplete-review bucket plus warning card for imported spend that should not yet be trusted as final category usage.

The same page also exposes a rules section where the user can create, edit, and delete reusable rules with a chosen match field (`title`, `recipient`, or `both`), a contains-text value, and a target category. Import review keeps its quick "save as rule" shortcut, but the rule model and dashboard management surface become explicit and inspectable.

## What We're NOT Doing

- No second bank or second format work in this slice.
- No advanced analytics dashboard with charts, trends-first landing, or cross-category forecasting.
- No universal carry-over for all categories.
- No full rules engine with multiple conditions, operators, or preview simulation.
- No background worker, cron job, or trigger-based summary recomputation.
- No automatic category correction without user-defined rules.
- No transaction editing beyond category assignment already shipped in S-02.

## Implementation Approach

Reuse the existing protected `/dashboard` route as the monthly summary workspace and introduce a dedicated summary domain layer under `src/lib/summary/`. That layer computes a selected month on demand from categories, incomes, rules, transactions, and import-batch review state, then upserts the result into `monthly_summaries` as a cached snapshot. Trust is handled explicitly: reviewed transactions contribute to category totals, while non-reviewed imports still contribute to the month's overall imported spend but are surfaced in a separate incomplete bucket and warning card rather than being silently folded into trusted categories.

At the same time, upgrade `categorization_rules` from one implicit merchant-pattern field to a small but explicit rule contract:

- `match_field`: `title`, `recipient`, or `both`
- `match_text`: text to search for using case-insensitive contains matching
- `target_category_id`

Finally, add a savings marker to categories so only user-designated savings categories participate in carry-over. Carry-over remains bounded to the selected category and month lineage; normal spending categories continue to behave as current-month budget limits only.

## Critical Implementation Details

### Summary Trust Boundary

The user explicitly chose to include all imported amounts but visually flag incomplete categories. That means S-03 cannot simply ignore non-reviewed batches or blend them into trusted category totals. The summary service should compute at least three distinct buckets for a month:

- reviewed categorized spend,
- reviewed uncategorized spend,
- incomplete-review imported spend.

Only reviewed categorized spend should drive per-category limit usage. The other two buckets must stay visible in summary totals and warning UI so the user sees the month's full imported spend without mistaking incomplete data for finished categorization.

### Savings Carry-Over Contract

The PRD's travel example implies accumulated allowance for some categories, but not for normal categories like food. S-03 should introduce a category-level opt-in such as `carryover_enabled boolean not null default false`. Carry-over math should only apply to those marked categories and should be derived from prior months' reviewed summaries, not from incomplete imports. That keeps the first carry-over model understandable and avoids inventing a separate savings-goal system.

To stay consistent with the cache-only role of `monthly_summaries`, carry-over should be recomputed from live historical source tables for prior reviewed months rather than read from cached snapshots as an authoritative chain.

### Rule Upgrade Contract

The current `merchant_pattern` column name and matching behavior are too specific for field-aware rules. S-03 should migrate the rule table to explicit matching semantics with:

- `match_field text not null` constrained to `title`, `recipient`, or `both`
- `match_text text not null`

Backfill existing rules as `match_field = 'both'` with `match_text` derived from the old pattern value. This preserves S-02 behavior for existing data while making the model fit the new dashboard rules UI.

### Cached Snapshot Role

`monthly_summaries` should not become the source of truth. Instead, S-03 should compute the selected month from live tables on load, then upsert a normalized `summary_snapshot`, `total_income`, `total_spent`, and `generated_at`. This makes the page deterministic and debuggable while avoiding stale-only reads after income edits, category changes, imports, or rule adjustments.

### Multi-Month Without Trend-First Complexity

The user wants multi-month support, but not necessarily a trend-first analytics page. The dashboard should therefore default to the latest imported month and reuse the existing month-picker pattern from `/budget`, optionally supplemented by a compact "available months" history list. That keeps the page grounded in one selected month while still supporting multi-month navigation.

## Phase 1: Summary and Rule Domain Contract

### Overview

Add the smallest schema and type updates needed to represent savings carry-over and field-aware rules before any summary or UI code is written.

### Changes Required:

#### 1. Categorization Rule Schema Upgrade

**File**: `supabase/migrations/<timestamp>_monthly_summary_rule_contract.sql`

**Intent**: Replace the current implicit merchant-pattern model with an explicit rule contract the user can understand and manage.

**Contract**:

- add `match_field text not null` constrained to `title`, `recipient`, or `both`
- add `match_text text not null`
- backfill existing rules from `merchant_pattern`
- replace or retire `merchant_pattern` so application code has one clear source of truth
- update uniqueness so rules are unique per `(user_id, match_field, match_text)`

This migration should preserve the effective behavior of S-02 rules by backfilling existing data to `match_field = 'both'`.

#### 2. Savings Category Marker

**File**: `supabase/migrations/<timestamp>_monthly_summary_rule_contract.sql`

**Intent**: Give S-03 a simple, explicit way to apply carry-over only to savings-style categories.

**Contract**:

- add `carryover_enabled boolean not null default false` to `budget_categories`
- keep existing category uniqueness and percentage-limit contracts unchanged

No new table is needed yet; the first carry-over implementation should build from this flag and historical summaries.

#### 3. Budget Category Flow Extension

**File**: `src/lib/budget/data.ts`

**Intent**: Keep budget category helpers aligned with the new savings marker instead of treating it as summary-only metadata.

**Contract**: Extend category create, update, and list helpers so `carryover_enabled` is part of the category contract used by both `/budget` and the summary domain.

**File**: `src/lib/budget/validation.ts`

**Intent**: Validate savings-category input with the same centralized pattern used for income and percentage limits.

**Contract**: Add validation for a category carry-over flag and keep existing total-percentage validation unchanged.

**File**: `src/pages/api/budget/categories/index.ts`

**Intent**: Allow new categories to opt into savings carry-over from the existing budget setup flow.

**Contract**: `POST` accepts validated `carryover_enabled` alongside `name` and `percentage_limit`.

**File**: `src/pages/api/budget/categories/[id].ts`

**Intent**: Allow existing categories to toggle savings carry-over without bypassing the established category-edit surface.

**Contract**: `PUT` accepts validated `carryover_enabled` alongside `name` and `percentage_limit`.

**File**: `src/components/budget/CategoryManager.tsx`

**Intent**: Give the user an explicit way to mark a category as savings-enabled before relying on carry-over in the dashboard.

**Contract**: Extend the create/edit forms with a savings-category toggle or checkbox bound to `carryover_enabled`, while preserving the current percentage-limit guardrails.

#### 4. Generated Types Refresh

**File**: `src/lib/database.types.ts`

**Intent**: Keep code contracts aligned with the new rule and category fields before summary services use them.

**Contract**: Regenerate types so `categorization_rules` and `budget_categories` expose the new fields across `Row`, `Insert`, and `Update`.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` applies the rule and category migration cleanly.
- Generated types expose `categorization_rules.match_field`, `categorization_rules.match_text`, and `budget_categories.carryover_enabled`.
- `npx astro check` passes after the type refresh.

#### Manual Verification:

- Review the migration and confirm existing S-02 rules would backfill to a field-aware equivalent instead of silently changing behavior.
- Confirm only explicitly marked categories can participate in carry-over; normal categories remain month-only.
- Confirm `/budget` create and edit flows now expose the savings-category toggle needed to drive carry-over behavior.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before building summary math and APIs.

---

## Phase 2: Summary Engine and Rule APIs

### Overview

Build the backend contracts for month discovery, summary computation, snapshot caching, and explicit rule CRUD.

### Changes Required:

#### 1. Summary Domain Module

**File**: `src/lib/summary/data.ts`

**Intent**: Centralize summary computation and snapshot caching instead of spreading finance math across route files.

**Contract**: Export helpers to:

- discover available months from imports and income records for the current user
- resolve the default selected month to the latest imported month, with safe fallback behavior
- load active categories and month income for the selected month
- load transactions and import-batch review state for the selected month
- load enough prior reviewed month data to recompute savings carry-over from live historical source tables
- compute a normalized summary result with:
  - total income
  - total imported spend
  - reviewed categorized spend by category
  - reviewed uncategorized spend
  - incomplete-review imported spend
  - per-category percentage-of-income and limit-usage values
- savings carry-over balances for `carryover_enabled` categories
- upsert the computed snapshot into `monthly_summaries`

The live tables remain the source of truth; `monthly_summaries` is refreshed from that live computation on load and must not be treated as the authoritative carry-over chain.

#### 2. Rule Data Helpers

**File**: `src/lib/rules/data.ts`

**Intent**: Extract rule CRUD and matching logic into a dedicated module now that rules are broader than import-review convenience writes.

**Contract**: Export helpers to:

- list owned rules with their target category metadata
- create a rule with `match_field`, `match_text`, and `target_category_id`
- update one owned rule
- delete one owned rule
- normalize and apply rules using case-insensitive contains matching against the chosen field or combined fields

`src/lib/imports/data.ts` should reuse the shared rule-matching logic after this phase instead of carrying its own hard-coded matching path.

#### 3. Summary and Rule HTTP Helpers

**File**: `src/lib/summary/http.ts`

**Intent**: Mirror the existing budget/import route pattern so summary and rule routes have consistent authenticated JSON handling.

**Contract**: Provide:

- auth guard helpers for the dashboard summary domain
- structured JSON success/error helpers
- selected-month request parsing and validation

**File**: `src/lib/rules/validation.ts`

**Intent**: Validate rule CRUD payloads in one place.

**Contract**: Validate:

- `match_field` as one of `title`, `recipient`, `both`
- non-blank `match_text`
- owned `target_category_id`

#### 4. Summary and Rule API Routes

**File**: `src/pages/api/dashboard/summary.ts`

**Intent**: Return one selected-month summary and refresh the cached snapshot on demand.

**Contract**: `GET` accepts a selected month query parameter, computes the live summary, upserts the snapshot, and returns:

- selected month metadata
- available months
- summary cards and category rows
- incomplete-review warning data

**File**: `src/pages/api/rules/index.ts`

**Intent**: Support listing and creating reusable rules from the dashboard UI.

**Contract**:

- `GET` returns all owned rules with target category details
- `POST` creates one validated rule with explicit field and text semantics

**File**: `src/pages/api/rules/[id].ts`

**Intent**: Support editing and deleting one owned rule.

**Contract**:

- `PATCH` updates `match_field`, `match_text`, or `target_category_id`
- `DELETE` removes one owned rule

#### 5. Category Helper Extension

**File**: `src/lib/budget/data.ts`

**Intent**: Reuse the savings-aware category contract from budget setup inside summary computation and rule-management flows.

**Contract**: Consume the savings-aware category shape from Phase 1 so summary services, dashboard loaders, and rule-management views all receive `carryover_enabled` consistently.

### Success Criteria:

#### Automated Verification:

- Summary-engine tests pass for selected-month computation, reviewed-versus-incomplete bucketing, limit math, and savings carry-over behavior.
- Rule helper and API tests pass for list/create/update/delete plus field-aware contains matching.
- `npx astro check` passes.
- Targeted lint passes for the new summary/rules files.

#### Manual Verification:

- Loading a month summary with incomplete imports shows a warning plus separate incomplete-review amount instead of silently blending that spend into trusted category totals.
- A savings-marked category carries unused allowance into a later month, while a normal category does not.
- Creating and editing a field-aware rule behaves as expected for `title`, `recipient`, and `both`.
- Creating or editing a category in `/budget` changes whether that category participates in carry-over on the dashboard.
- Backdated changes to an earlier reviewed month are reflected in later-month carry-over after summary recomputation, without depending on stale cached snapshots.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before converting `/dashboard` into the full summary workspace.

---

## Phase 3: Dashboard Summary and Rules UI

### Overview

Turn the placeholder dashboard into the protected monthly summary workspace and add a visible rule-management surface.

### Changes Required:

#### 1. Dashboard Route Conversion

**File**: `src/pages/dashboard.astro`

**Intent**: Reuse the already protected dashboard as the summary route instead of creating another top-level page.

**Contract**: Load the selected month from the query string, default to the latest imported month, and server-load:

- available months
- selected month summary payload
- active categories for rule management
- existing reusable rules

The route should continue to require authentication through existing middleware behavior.

#### 2. Summary Workspace Component

**File**: `src/components/dashboard/SummaryWorkspace.tsx`

**Intent**: Coordinate month switching, summary refresh, warning states, and rule CRUD in one interactive island.

**Contract**: Accept server-provided initial summary and rules data, then manage:

- switching months
- refreshing the selected summary via API
- creating/editing/deleting rules
- notice and error states for summary and rules actions

#### 3. Summary UI Components

**File**: `src/components/dashboard/MonthlySummaryHeader.tsx`

**Intent**: Make month selection and summary trust state obvious at the top of the page.

**Contract**: Show:

- selected month
- available month switcher or month picker
- generated-at or refreshed-at summary metadata
- a concise warning when incomplete-review spend exists

**File**: `src/components/dashboard/SummaryCards.tsx`

**Intent**: Surface the headline month numbers quickly.

**Contract**: Show cards for:

- income
- total imported spend
- reviewed categorized spend
- incomplete-review spend

**File**: `src/components/dashboard/CategoryUsageTable.tsx`

**Intent**: Render the trusted category breakdown for the selected month.

**Contract**: Show one row per category with:

- spend
- percent of income
- configured percentage limit
- limit usage
- carry-over opening/closing values for savings categories

The component should keep reviewed uncategorized and incomplete-review amounts separate from category rows rather than forcing them into one normal category.

**File**: `src/components/dashboard/IncompleteReviewNotice.tsx`

**Intent**: Make uncertain spend impossible to miss.

**Contract**: Show the amount and source month/batch context for incomplete imported spend, plus guidance to return to `/imports` to finish review if needed.

#### 4. Rule Management UI

**File**: `src/components/rules/RuleManager.tsx`

**Intent**: Give the user a visible, editable rules surface on the summary page.

**Contract**: Render:

- rule list with current match field, text, and target category
- create form
- edit form or inline edit controls
- delete action

The UI should describe rules in user language, for example "Match `recipient` contains `Lidl` -> Food", rather than exposing raw schema names.

**File**: `src/components/rules/RuleForm.tsx`

**Intent**: Reuse one field-aware form for create and edit operations.

**Contract**: Provide:

- `match_field` select (`title`, `recipient`, `both`)
- `match_text` input
- target category select

#### 5. Import Review Rule Shortcut Alignment

**File**: `src/components/imports/TransactionReviewTable.tsx`

**Intent**: Keep the existing quick rule-save shortcut consistent with the upgraded explicit rule model.

**Contract**: When a user opts into "Save as rule" during import review, the created rule should follow the new default semantics chosen for the MVP, namely `match_field = recipient` with `match_text` derived from the reviewed transaction recipient unless the dashboard later edits it.

### Success Criteria:

#### Automated Verification:

- The dashboard route type-checks with its summary and rules data contracts.
- Build passes: `npm run build`.
- UI-focused tests cover month switching, incomplete-review warnings, and rule CRUD states.

#### Manual Verification:

- Visiting `/dashboard` while signed out still redirects to `/auth/signin`.
- A signed-in user lands on the latest imported month by default and can switch to another available month.
- The selected-month summary shows trusted category usage plus a separate incomplete-review warning/bucket when review is unfinished.
- A user can create, edit, and delete a field-aware rule from the dashboard.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before tightening coverage and syncing roadmap state.

---

## Phase 4: Regression Coverage and Roadmap Readiness

### Overview

Harden the summary math, rule contracts, and planning handoff so S-03 is ready for implementation and later expansion.

### Changes Required:

#### 1. Focused Summary and Rule Tests

**File**: `tests/monthly-summary-and-rules.test.ts`

**Intent**: Put the most verification depth on finance math and trust-boundary behavior, with enough UI coverage to protect the new dashboard states.

**Contract**: Add focused Vitest coverage for:

- selected-month discovery and latest-month default behavior
- reviewed categorized totals
- reviewed uncategorized totals
- incomplete-review bucket separation
- percent-of-income and limit usage calculations
- savings carry-over across months
- rule CRUD and field-aware matching
- dashboard summary route responses
- import-review quick-save compatibility with the new rule contract

#### 2. Dashboard Fixture and Sample Data Strategy

**File**: `tests/monthly-summary-and-rules.test.ts` or `tests/fixtures/summary/`

**Intent**: Keep multi-month carry-over and incomplete-review scenarios readable and repeatable.

**Contract**: Use compact synthetic month fixtures that model:

- one reviewed month
- one incomplete month
- one savings category with carry-over

Do not rely on real statement files for summary math tests unless they specifically add value.

#### 3. Roadmap Planning-State Alignment

**File**: `context/foundation/roadmap.md`

**Intent**: Keep roadmap planning state aligned with the existence of an accepted S-03 plan.

**Contract**: Once the plan is reviewed and accepted, update S-03 from `proposed` to `ready`. Do not mark it `done` until implementation, review, and archive are complete.

#### 4. Brief and Handoff Polish

**File**: `context/changes/monthly-summary-and-rules/plan-brief.md`

**Intent**: Keep the concise handoff aligned with the final decisions and intended trust model.

**Contract**: Ensure the brief clearly reflects:

- `/dashboard` as the summary surface
- multi-month month-picker navigation
- explicit incomplete-review bucket treatment
- field-aware rules on the summary page
- savings-only carry-over

### Success Criteria:

#### Automated Verification:

- The focused summary/rule test suite passes.
- `npx astro check` passes.
- `npm run build` passes.
- Targeted lint passes for the touched summary and rule files.

#### Manual Verification:

- Review the brief and full plan for phase clarity before starting `/10x-implement monthly-summary-and-rules phase 1`.
- Confirm S-04 remains independent and that this plan does not accidentally absorb second-format work.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before implementation kickoff or archive flow.

## Testing Strategy

### Unit Tests:

- Validate `match_field` and `match_text` rule payloads.
- Validate selected-month normalization and latest-month fallback logic.
- Validate summary bucket math for reviewed categorized, reviewed uncategorized, and incomplete-review totals.
- Validate carry-over calculations for savings categories only.
- Validate field-aware rule matching for `title`, `recipient`, and `both`.

### Integration Tests:

- Summary route recomputes live data and refreshes the cached `monthly_summaries` snapshot.
- Carry-over is derived from live historical reviewed data even when an earlier month changes after a snapshot already exists.
- Rule create/update/delete routes enforce ownership and valid categories.
- Import review quick-save still creates a valid rule under the upgraded schema.
- Dashboard month switching loads the right selected-month summary.

### Manual Testing Steps:

1. Sign out and verify `/dashboard` redirects to `/auth/signin`.
2. Sign in and verify the dashboard opens on the latest imported month by default.
3. Switch to another available month and verify the cards and category rows refresh.
4. Verify a month with incomplete imports shows a warning plus separate incomplete-review amount.
5. Verify a reviewed month shows trusted category totals against income and limits.
6. Mark one category as savings-enabled, then verify unused allowance carries into a later month.
7. Create, edit, and delete rules on the dashboard and confirm the UI describes them with explicit field semantics.

## Performance Considerations

The MVP remains small-user and low-volume, so on-demand recomputation per selected month is acceptable. Keep summary queries scoped by user and month, and load only the months actually needed to recompute carry-over for the selected user/month lineage. Snapshot caching should optimize repeat reads and debugging, but correctness matters more than aggressive caching in this slice.

## Migration Notes

Land the rule and category schema migration before changing import-review rule creation or building summary math. The backfill path for existing S-02 rules must preserve behavior closely enough that archived import-review work does not become misleading. Because `monthly_summaries` becomes a cache, not the source of truth, rollout risk stays low only if later-month carry-over is recomputed from live historical reviewed data rather than inherited from stale snapshot chains.

Do not commit real financial data or private exports. Summary tests should use synthetic month fixtures and sanitized rule values only.

## References

- Roadmap north star and S-03 item: `context/foundation/roadmap.md`
- PRD summary and rule requirements: `context/foundation/prd.md`
- Finance foundation schema: `supabase/migrations/20260526103000_finance_domain_foundation.sql`
- Current budget month-switching pattern: `src/pages/budget.astro`
- Current dashboard placeholder: `src/pages/dashboard.astro`
- Current protected route list: `src/middleware.ts`
- Current topbar navigation: `src/components/Topbar.astro`
- Current import review state and rule behavior: `src/lib/imports/data.ts`
- Existing import review UI: `src/components/imports/ImportWorkspace.tsx`
- Accepted lessons: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Summary and Rule Domain Contract

#### Automated

- [x] 1.1 `npx supabase db reset` applies the rule and category migration cleanly.
- [x] 1.2 Generated types expose `categorization_rules.match_field`, `categorization_rules.match_text`, and `budget_categories.carryover_enabled`.
- [x] 1.3 `npx astro check` passes after the type refresh.

#### Manual

- [x] 1.4 Confirm existing S-02 rules backfill to a field-aware equivalent instead of changing meaning.
- [x] 1.5 Confirm only explicitly marked savings categories participate in carry-over.

### Phase 2: Summary Engine and Rule APIs

#### Automated

- [x] 2.1 Summary-engine tests pass for selected-month resolution, reviewed-versus-incomplete bucketing, limit math, and savings carry-over behavior.
- [x] 2.2 Rule helper and API tests pass for list/create/update/delete plus field-aware contains matching.
- [x] 2.3 `npx astro check` passes.
- [x] 2.4 Targeted lint passes for the new summary and rules files.

#### Manual

- [x] 2.5 Loading a month summary with incomplete imports shows a warning plus separate incomplete-review amount instead of silently blending that spend into trusted category totals.
- [x] 2.6 A savings-marked category carries unused allowance into a later month, while a normal category does not.
- [x] 2.7 Creating and editing a field-aware rule behaves as expected for `title`, `recipient`, and `both`.

### Phase 3: Dashboard Summary and Rules UI

#### Automated

- [x] 3.1 The dashboard route type-checks with its summary and rules data contracts.
- [x] 3.2 `npm run build` passes.
- [x] 3.3 UI-focused tests cover month switching, incomplete-review warnings, and rule CRUD states.

#### Manual

- [x] 3.4 Visiting `/dashboard` while signed out redirects to `/auth/signin`.
- [x] 3.5 A signed-in user lands on the latest imported month by default and can switch to another available month.
- [x] 3.6 The selected-month summary shows trusted category usage plus a separate incomplete-review warning/bucket when review is unfinished.
- [x] 3.7 A user can create, edit, and delete a field-aware rule from the dashboard.

### Phase 4: Regression Coverage and Roadmap Readiness

#### Automated

- [ ] 4.1 The focused summary/rule test suite passes.
- [ ] 4.2 `npx astro check` passes.
- [ ] 4.3 `npm run build` passes.
- [ ] 4.4 Targeted lint passes for the touched summary and rule files.

#### Manual

- [ ] 4.5 Review the brief and full plan for phase clarity before starting `/10x-implement monthly-summary-and-rules phase 1`.
- [ ] 4.6 Confirm S-04 remains independent and that this plan does not accidentally absorb second-format work.
