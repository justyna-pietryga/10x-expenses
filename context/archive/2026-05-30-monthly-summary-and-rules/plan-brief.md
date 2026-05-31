# Monthly Summary and Reusable Rules - Plan Brief

> Full plan: `context/changes/monthly-summary-and-rules/plan.md`

## What & Why

Build S-03 so a signed-in user can open the protected dashboard, see budget usage for a selected month, understand how reviewed and incomplete imports affect the numbers, and manage reusable categorization rules without going back through import review. This is the roadmap north star because it is the first slice that turns imported transactions, income, and category limits into a budgeting outcome the user can actually trust and use.

## Starting Point

S-01 already gives us monthly income and percentage-based categories, and S-02 already gives us imported transactions, review completion state, and basic opt-in rule creation. What is still missing is everything that turns that data into a summary: no dashboard summary model, no carry-over behavior, no rule-management UI, and no use of the existing `monthly_summaries` table.

## Desired End State

A signed-in user lands on `/dashboard`, sees the latest imported month by default, and can switch across available months with a simple month picker. The page shows multi-month access, a selected-month budget summary with category totals, percent-of-income usage, savings carry-over for marked categories, and a clearly separated incomplete-review bucket so imported but not-yet-trusted spend is visible without being silently blended into reviewed categories. The same page also lets the user inspect, create, edit, and delete reusable text rules that match `title`, `recipient`, or both.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Summary shape | Multi-month access with a selected-month budget dashboard | Keeps the north-star slice valuable while still centering one concrete month at a time. |
| Dashboard surface | Reuse `/dashboard` for summary plus rules | The route already exists in protected nav and is the natural home for the budgeting outcome. |
| Review trust boundary | Include all imported spend, but separate incomplete-review amounts | Gives faster feedback without hiding uncertainty in trusted category totals. |
| Rule model | Field-aware contains-text rules for `title`, `recipient`, or `both` | Solves the ambiguity discovered in S-02 without building a complex rules engine. |
| Rule management | Manage rules on the summary page | Lets users refine categorization where they actually see summary outcomes. |
| Summary persistence | Compute on demand and refresh `monthly_summaries` as a cache | Uses the existing table without making stale snapshots the source of truth or carry-over authority. |
| Carry-over | Support carry-over only for user-marked savings categories | Covers the PRD's travel-style example without forcing rollover semantics on normal spend categories. |

## Scope

**In scope:** rule-schema upgrade, savings-category flagging, summary computation service, cached monthly snapshot upsert, protected dashboard summary UI, month switching, incomplete-review warning/bucket, and rule CRUD.

**Out of scope:** second bank support, chart-heavy analytics, universal carry-over for all categories, advanced multi-condition rules, background summary jobs, and transaction editing beyond category assignment.

## Architecture / Approach

Extend the finance schema just enough to support savings-category carry-over and field-aware rules, then add a summary domain layer that computes one selected month from transactions, income, categories, and live historical reviewed data for prior savings balances. The `/dashboard` page becomes the protected summary workspace: it loads the selected month, recomputes and caches the snapshot on demand, shows reviewed versus incomplete amounts distinctly, and renders a side-by-side rules manager that uses the same server-only Astro API style as budget and imports.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Summary and Rule Domain Contract | Schema updates for carry-over categories and field-aware rules | Getting the rule or carry-over contract wrong would ripple through every later slice. |
| 2. Summary Engine and Rule APIs | On-demand summary computation, cached snapshots, and rule CRUD routes | Finance math and trust-boundary mistakes would undermine the whole product promise. |
| 3. Dashboard Summary and Rules UI | Protected monthly dashboard with month switching, warnings, and rule management | The page has to stay understandable while carrying both summary and rule workflows. |
| 4. Regression Coverage and Roadmap Readiness | Focused tests, fixture coverage, and planning-state sync | Weak math or state coverage would make later format/support work fragile. |

**Prerequisites:** S-01 and S-02 are complete and archived.
**Estimated effort:** ~4 implementation sessions across 4 phases.

## Open Risks & Assumptions

- The MVP can afford on-demand recomputation because user scale and monthly data volume are still small.
- Incomplete-review spend must remain clearly separate or users may over-trust category totals.
- Savings carry-over needs a narrow category flag now; broader envelope or goals modeling stays out of scope.

## Success Criteria (Summary)

- A signed-in user can open `/dashboard`, switch months, and see category usage against income and limits.
- The page clearly separates incomplete-review spend from trusted reviewed category totals.
- A user can manage reusable rules with explicit match field selection and see those rules affect future categorization behavior.
