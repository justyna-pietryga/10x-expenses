---
project: "Expenses"
version: 1
status: draft
created: 2026-05-25
updated: 2026-06-16
prd_version: 1
main_goal: market-feedback
top_blocker: time
---

# Roadmap: Expenses

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

The first release needs to replace a fragile monthly spreadsheet ritual with one trustworthy web flow: import supported bank statements, map spending into personal budget categories, and see how spending compares against income-based limits. The sequencing bias is `market-feedback`, so the roadmap favors the earliest end-to-end budgeting loop that proves a user will trust imported data enough to review it, correct it, return to older months, and keep multiple bank-month imports moving without losing track of review state.

The main planning constraint is `time`: the PRD sets a 3-week after-hours MVP, so the order below keeps breadth narrow until one complete budget-review loop is working.

## North star

**S-03: User can save categorization rules and see a monthly budget summary** - the north star here means the smallest end-to-end slice whose successful delivery would prove the core product hypothesis, so it is placed as early as its prerequisites allow.

## At a glance

| ID    | Change ID                         | Outcome (user can ...)                                                                                                                        | Prerequisites | PRD refs                                                    | Status   |
| ----- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------- | -------- |
| F-01  | finance-domain-foundation         | (foundation) per-user finance records, import batches, categories, limits, rules, and summaries persist under one consistent domain model     | -             | Access Control, Non-Functional Requirements, Business Logic | done     |
| S-01  | budget-setup                      | user can define income, custom categories, and percentage-based limits                                                                        | F-01          | FR-001, FR-007, FR-008, FR-009                              | done     |
| S-02  | first-bank-import-review          | user can choose a supported bank, import one supported statement format, review parsed transactions, and replace an existing bank-month batch | F-01, S-01    | FR-001, FR-002, FR-003, FR-005, FR-006, FR-010              | done     |
| S-03  | monthly-summary-and-rules         | user can save reusable categorization rules and see monthly category usage against income and limits                                          | S-01, S-02    | US-01, FR-001, FR-010, FR-011, FR-012                       | done     |
| S-04  | second-supported-format           | user can repeat the import-and-review flow with a second supported statement format                                                           | S-02          | FR-004                                                      | done     |
| UX-01 | import-review-bulk-categorization | user can review many imported transactions efficiently, save category changes in bulk, and clearly see unsaved state                          | S-02          | FR-006, FR-010                                              | done |
| UX-02 | import-review-rule-application    | user can create field-aware rules from import review, see rule-backed rows, and apply a new rule to matching rows in the current batch        | UX-01, S-03   | FR-010, FR-011                                              | done     |
| UX-03 | management-surface-density        | user can scan and manage categories and rules in denser operational layouts without excessive scrolling                                       | UX-01, UX-02  | FR-007, FR-011                                              | proposed |
| UX-04 | uncategorized-review-prioritization | user can prioritize uncategorized transactions during import review by surfacing them first and/or filtering the list to only those rows     | UX-01         | FR-006, FR-010                                              | proposed |
| UX-05 | transaction-inclusion-control     | user can exclude specific imported rows from budget calculations without deleting the source statement record                                  | UX-01, S-03   | FR-006, FR-010, FR-012                                      | done     |
| UX-06 | import-history-and-parallel-review | user can see older imports, reopen or edit past batches, and review multiple bank-month imports in parallel without being forced to finish one first | S-02, S-04, UX-01 | FR-002, FR-005, FR-006, FR-010                          | done     |
| UX-07 | dashboard-category-usage-chart    | user can see category usage visualized on the dashboard as a chart instead of reading summary values only                                     | S-03          | FR-012                                                      | proposed |
| UX-08 | full-width-dashboard-panels       | user can use dashboard and management panels that expand to the available screen width instead of leaving large unused horizontal space       | S-03          | FR-012                                                      | done     |
| UX-09 | post-login-dashboard-redirect     | user lands on the dashboard immediately after signing in instead of stopping on an intermediate auth surface                                  | F-01          | Access Control, FR-001                                      | proposed |
| S-05  | cashflow-type-separation          | user can separate expenses, income, reimbursements, and transfers so summaries do not force all rows into expense categorization              | UX-05, S-03   | FR-006, FR-010, FR-012                                      | done     |
| S-06  | fixed-expense-obligations         | user can model fixed bill-like expenses as required amount targets instead of percentage-based limits only                                     | S-01, S-03    | FR-008, FR-009, FR-012                                      | proposed |
| S-07  | additional-bank-support           | user can import statements from additional banks such as Santander and PKO BP using the same review flow                                      | S-04          | FR-003, FR-004                                              | proposed |

## Baseline

What's already in place in the codebase as of `2026-05-25` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present - Astro page routing and React UI islands are already scaffolded in `package.json` and `src/pages/`.
- **Backend / API:** present - auth API handlers already exist in `src/pages/api/auth/`.
- **Data:** partial - Supabase integration exists in `src/lib/supabase.ts` and `supabase/config.toml`, but no expenses-domain schema or migrations exist yet.
- **Auth:** present - session lookup and route protection already exist in `src/lib/supabase.ts` and `src/middleware.ts`.
- **Deploy / infra:** present - Cloudflare deployment and CI are already configured in `wrangler.jsonc` and `.github/workflows/ci.yml`.
- **Observability:** partial - platform observability is enabled in `wrangler.jsonc`, but there is no app-level monitoring for import or summary failures.

## Foundations

### F-01: Finance domain foundation

- **Outcome:** (foundation) per-user finance records, import batches, categories, limits, rules, and summaries persist under one consistent domain model.
- **Change ID:** finance-domain-foundation
- **PRD refs:** Access Control, Non-Functional Requirements, Business Logic
- **Unlocks:** S-01, S-02, S-03, S-04
- **Prerequisites:** -
- **Parallel with:** -
- **Blockers:** -
- **Unknowns:** none.
- **Risk:** If this foundation stays implicit, later slices will duplicate core budget rules or weaken user-level data isolation around sensitive financial data.
- **Status:** done

## Slices

### S-01: Budget setup

- **Outcome:** user can define income, custom categories, and percentage-based limits.
- **Change ID:** budget-setup
- **PRD refs:** FR-001, FR-007, FR-008, FR-009
- **Prerequisites:** F-01
- **Parallel with:** -
- **Blockers:** -
- **Unknowns:** none.
- **Risk:** Shipping import first would produce transactions before the user has a trustworthy budget frame to map them against, which weakens the first feedback loop.
- **Status:** done

### S-02: First supported statement import and review

- **Outcome:** user can choose a supported bank, import one supported statement format, review parsed transactions, and replace an existing bank-month batch.
- **Change ID:** first-bank-import-review
- **PRD refs:** FR-001, FR-002, FR-003, FR-005, FR-006, FR-010
- **Prerequisites:** F-01, S-01
- **Parallel with:** -
- **Blockers:** -
- **Unknowns:** none.
- **Risk:** This is where parsing accuracy and overwrite behavior first touch real user data, so it should land before summary work hides import mistakes downstream.
- **Status:** done

### S-03: Monthly summary and reusable rules

- **Outcome:** user can save reusable categorization rules and see monthly category usage against income and limits.
- **Change ID:** monthly-summary-and-rules
- **PRD refs:** US-01, FR-001, FR-010, FR-011, FR-012
- **Prerequisites:** S-01, S-02
- **Parallel with:** S-04
- **Blockers:** -
- **Unknowns:** none.
- **Risk:** This is the first full proof of value, so it should follow import review immediately instead of being delayed by broader format coverage or polish.
- **Status:** done

### S-04: Second supported statement format

- **Outcome:** user can repeat the import-and-review flow with a second supported statement format.
- **Change ID:** second-supported-format
- **PRD refs:** FR-004
- **Prerequisites:** S-02
- **Parallel with:** S-03
- **Blockers:** -
- **Unknowns:** none.
- **Risk:** Expanding format coverage too early stretches the MVP before one complete budget loop is proven, but leaving it out would miss a declared must-have requirement.
- **Status:** done

## UX Follow-ups

### UX-01: Import review bulk categorization

- **Outcome:** user can review many imported transactions efficiently, save category changes in bulk, and clearly see unsaved state.
- **Change ID:** import-review-bulk-categorization
- **PRD refs:** FR-006, FR-010
- **Prerequisites:** S-02
- **Parallel with:** -
- **Blockers:** -
- **Unknowns:** exact row-level error copy and save-all placement should be validated during implementation.
- **Risk:** If review stays row-by-row, users must repeat low-value clicks and may lose trust in whether category edits were saved.
- **Status:** done

### UX-02: Import review rule application

- **Outcome:** user can create field-aware rules from import review, see rule-backed rows, and apply a new rule to matching rows in the current batch.
- **Change ID:** import-review-rule-application
- **PRD refs:** FR-010, FR-011
- **Prerequisites:** UX-01, S-03
- **Parallel with:** -
- **Blockers:** UX-01 must clarify the batch review save lifecycle before rules can safely mutate matching rows.
- **Unknowns:** rule preview wording, field defaults, and current-batch application confirmation need a dedicated plan.
- **Risk:** If rule creation remains opaque, users cannot tell why rows are categorized or confidently apply a rule to the rest of a batch.
- **Status:** done

### UX-03: Management surface density

- **Outcome:** user can scan and manage categories and rules in denser operational layouts without excessive scrolling.
- **Change ID:** management-surface-density
- **PRD refs:** FR-007, FR-011
- **Prerequisites:** UX-01, UX-02
- **Parallel with:** -
- **Blockers:** UX-01 and UX-02 should settle the workflow semantics before the management surfaces are compressed.
- **Unknowns:** final density target, mobile behavior, and whether categories and rules need separate or combined management views.
- **Risk:** If the management UI remains too spacious after workflows expand, routine category/rule maintenance becomes slow and visually noisy.
- **Status:** implemented

### UX-04: Uncategorized review prioritization

- **Outcome:** user can prioritize uncategorized transactions during import review by surfacing them first and/or filtering the list to only those rows.
- **Change ID:** uncategorized-review-prioritization
- **PRD refs:** FR-006, FR-010
- **Prerequisites:** UX-01
- **Parallel with:** -
- **Blockers:** UX-01 should finish first so the base review interaction model and save lifecycle are stable before adding new view modes.
- **Unknowns:** whether the MVP should ship sorting, filtering, or both; how the chosen mode interacts with bulk edits; and whether the preference should persist per user.
- **Risk:** If uncategorized rows remain buried in the full transaction list, users spend review time scanning already-resolved items instead of clearing the rows that still need decisions.
- **Status:** proposed

### UX-05: Transaction inclusion control

- **Outcome:** user can exclude specific imported rows from budget calculations without deleting the source statement record.
- **Change ID:** transaction-inclusion-control
- **PRD refs:** FR-006, FR-010, FR-012
- **Prerequisites:** UX-01, S-03
- **Parallel with:** -
- **Blockers:** UX-01 should settle row editing and save behavior first so inclusion state fits the same review workflow.
- **Unknowns:** whether the MVP needs a single `Exclude from calculations` flag or a small set of reasons such as transfer, reimbursement, duplicate, and ignore.
- **Risk:** If the only escape hatch is row deletion or forced categorization, users lose trust in the audit trail and the summary can stay artificially inflated by rows they never wanted counted.
- **Status:** done

### UX-06: Import history and parallel review

- **Outcome:** user can see older imports, reopen or edit past batches, and review multiple bank-month imports in parallel without being forced to finish one first.
- **Change ID:** import-history-and-parallel-review
- **PRD refs:** FR-002, FR-005, FR-006, FR-010
- **Prerequisites:** S-02, S-04, UX-01
- **Parallel with:** UX-02, UX-04, UX-05
- **Blockers:** S-02 and S-04 must already prove canonical bank-month import identity, and UX-01 should settle dirty-state save behavior before the app exposes several reviewable batches at once.
- **Unknowns:** whether the first cut should use a simple import-history list or a fuller workspace dashboard; how completed versus incomplete batches should be surfaced; whether old reviewed batches reopen inline or on a dedicated detail route; and whether the default ordering should favor most recent month, incomplete review, or bank grouping.
- **Risk:** If imports disappear once reviewed, or if starting a second bank/month import blocks work on the first, users cannot backfill the last few months, compare multiple accounts in the same period, or recover from interrupted review sessions with confidence.
- **Status:** done

### UX-07: Dashboard category usage chart

- **Outcome:** user can see category usage visualized on the dashboard as a chart instead of reading summary values only.
- **Change ID:** dashboard-category-usage-chart
- **PRD refs:** FR-012
- **Prerequisites:** S-03
- **Parallel with:** UX-05, UX-06
- **Blockers:** S-03 must already expose trustworthy monthly category totals before the chart can present them.
- **Unknowns:** which chart type best fits the MVP, whether the first cut should emphasize category share or category-vs-limit comparison, and how the chart should collapse low-volume categories on smaller screens.
- **Risk:** If the dashboard remains table- or card-only, users must scan raw numbers to understand where spending concentrates, which weakens the value of the summary surface.
- **Status:** proposed

### UX-08: Full-width dashboard panels

- **Outcome:** user can use dashboard and management panels that expand to the available screen width instead of leaving large unused horizontal space.
- **Change ID:** full-width-dashboard-panels
- **PRD refs:** FR-012
- **Prerequisites:** S-03
- **Parallel with:** UX-07, S-05
- **Blockers:** S-03 must already expose the dashboard and summary surfaces that need layout expansion.
- **Unknowns:** which routes should adopt the wider container first, what maximum width still preserves readability on large screens, and how the wider layout should collapse on tablet breakpoints.
- **Risk:** If key panels stay artificially narrow on desktop, users waste screen real estate, review less data at once, and the management/dashboard surfaces feel more cramped than the workflow requires.
- **Status:** done

### UX-09: Post-login dashboard redirect

- **Outcome:** user lands on the dashboard immediately after signing in instead of stopping on an intermediate auth surface.
- **Change ID:** post-login-dashboard-redirect
- **PRD refs:** Access Control, FR-001
- **Prerequisites:** F-01
- **Parallel with:** UX-08
- **Blockers:** Existing auth guard and session bootstrap behavior must stay consistent so unauthenticated users still reach `/auth/signin` and authenticated users reliably resolve to the dashboard.
- **Unknowns:** whether the app should always prefer `/dashboard` after login or preserve an intended destination when the user was originally redirected from a protected route.
- **Risk:** If successful sign-in does not hand users directly into the main product surface, the first-run flow feels incomplete and adds friction right after authentication succeeds.
- **Status:** proposed

### S-05: Cashflow type separation

- **Outcome:** user can separate expenses, income, reimbursements, and transfers so summaries do not force all rows into expense categorization.
- **Change ID:** cashflow-type-separation
- **PRD refs:** FR-006, FR-010, FR-012
- **Prerequisites:** UX-05, S-03
- **Parallel with:** -
- **Blockers:** UX-05 should land first so the team does not conflate "exclude this row" with "this row is valid but belongs to a different cashflow type".
- **Unknowns:** whether reimbursements should appear as a separate inflow bucket or offset the original spending category; whether salary and ad hoc inflows share one income model; and whether the import review should auto-suggest type from transaction sign plus user rules.
- **Risk:** If every positive inflow is forced into the expense model, spending totals become misleading, salary gets mixed into category review, and the summary UI cannot explain what actually happened in the month.
- **Status:** done

### S-06: Fixed expense obligations

- **Outcome:** user can model fixed bill-like expenses as required amount targets instead of percentage-based limits only.
- **Change ID:** fixed-expense-obligations
- **PRD refs:** FR-008, FR-009, FR-012
- **Prerequisites:** S-01, S-03
- **Parallel with:** UX-07
- **Blockers:** S-01 must already provide editable category setup, and S-03 must already calculate reliable monthly category totals before the app can compare them against fixed required amounts.
- **Unknowns:** whether a category can have both a percentage budget and a fixed obligation at the same time; whether fixed expenses should be monthly-only or support custom cadence later; and how partially paid bills should appear in the summary when multiple transactions map to one obligation.
- **Risk:** If all categories are forced into percentage limits, essential bills such as rent, subscriptions, or utilities are modeled inaccurately, and the dashboard cannot distinguish discretionary overspending from mandatory obligations the user simply has to cover.
- **Status:** proposed

### S-07: Additional bank support

- **Outcome:** user can import statements from additional banks such as Santander and PKO BP using the same review flow.
- **Change ID:** additional-bank-support
- **PRD refs:** FR-003, FR-004
- **Prerequisites:** S-04
- **Parallel with:** UX-07, UX-08
- **Blockers:** The current import pipeline should already have one stable pattern for adding bank-specific parsers so new support extends the same validation and review flow instead of creating one-off import behavior.
- **Unknowns:** which export variants should be supported first for Santander and PKO BP; whether each bank needs one canonical file type or multiple; and how much parser normalization differs from the banks already supported.
- **Risk:** If support stays limited to the current banks, the product blocks otherwise-qualified users before they can reach the budgeting loop, and parser work gets deferred until it is harder to fit into the existing import architecture cleanly.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                         | Suggested issue title                                                          | Ready for `/10x-plan` | Notes                                     |
| ---------- | --------------------------------- | ------------------------------------------------------------------------------ | --------------------- | ----------------------------------------- |
| F-01       | finance-domain-foundation         | Establish the finance domain foundation for per-user budget data               | yes                   | Run `/10x-plan finance-domain-foundation` |
| S-01       | budget-setup                      | Let users define income, categories, and percentage-based limits               | yes                   | Run `/10x-plan budget-setup`              |
| S-02       | first-bank-import-review          | Support first-bank import, transaction review, and bank-month replace behavior | yes                   | Planned and implemented; archive pending  |
| S-03       | monthly-summary-and-rules         | Show monthly summary and persist reusable categorization rules                 | yes                   | Planned and implemented; archive pending  |
| S-04       | second-supported-format           | Add a second supported statement format to the import flow                     | yes                   | Implemented; archive pending              |
| UX-01      | import-review-bulk-categorization | Improve import review with bulk category saving and clear unsaved state        | no                    | Implemented; archive pending              |
| UX-02      | import-review-rule-application    | Add field-aware import rules and current-batch rule application                | no                    | Depends on UX-01 and S-03                 |
| UX-03      | management-surface-density        | Compact category and rule management surfaces                                  | no                    | Depends on UX-01 and UX-02                |
| UX-04      | uncategorized-review-prioritization | Prioritize uncategorized rows in import review with sort and/or filter modes | no                    | Depends on UX-01                          |
| UX-05      | transaction-inclusion-control     | Let users exclude imported rows from budget calculations without deleting them | no                    | Depends on UX-01 and S-03                 |
| UX-06      | import-history-and-parallel-review | Add import history, reopening, and parallel review across bank-month batches | no                    | Implemented; archive pending             |
| UX-07      | dashboard-category-usage-chart    | Add a dashboard chart to visualize monthly category usage                     | no                    | Depends on S-03                           |
| UX-08      | full-width-dashboard-panels       | Expand dashboard and management panels to better use available screen width   | no                    | Depends on S-03                           |
| UX-09      | post-login-dashboard-redirect     | Redirect users to the dashboard immediately after successful sign-in          | no                    | Review auth redirect behavior first       |
| S-05       | cashflow-type-separation          | Separate expenses, income, reimbursements, and transfers in review and summary | no                    | Depends on UX-05 and S-03                 |
| S-06       | fixed-expense-obligations         | Support fixed bill-like categories with required amount targets               | no                    | Depends on S-01 and S-03                  |
| S-07       | additional-bank-support           | Add statement import support for additional banks such as Santander and PKO BP | no                    | Confirm target export variants first      |

This table is the clean handoff to Jira/Linear or any MCP-backed backlog. Include one row for every `F-NN` and `S-NN`. It should be compact enough to copy into issues, but it must not duplicate the detailed roadmap body.

## Open Roadmap Questions

1. None.

## Parked

- **Mobile application** - Why parked: PRD Non-Goals says the MVP is web-only.
- **Family or member synchronization** - Why parked: PRD Non-Goals limits the MVP to a single individual account.
- **Universal bank parser** - Why parked: PRD Non-Goals keeps import constrained to explicit supported bank and format combinations.
- **Automatic bank connection or account sync** - Why parked: PRD Non-Goals keeps the MVP on manual statement-file imports.
- **Fully AI-only categorization** - Why parked: PRD Non-Goals says categorization must remain controllable through user-defined rules.

## Done

(Empty on first generation. `/10x-archive` appends an entry here - and flips that item's `Status` to `done` - when a change whose `Change ID` matches the item is archived. Do NOT pre-populate. Format:)

- **<Slice ID>: <Outcome>** - Archived <YYYY-MM-DD> -> `context/archive/<YYYY-MM-DD-change-id>/`. Lesson: <pointer to lessons.md if any, or `-`>.
- **F-01: (foundation) per-user finance records, import batches, categories, limits, rules, and summaries persist under one consistent domain model** - Archived 2026-05-29 -> `context/archive/2026-05-25-finance-domain-foundation/`. Lesson: -.
- **S-01: user can define income, custom categories, and percentage-based limits** - Archived 2026-05-29 -> `context/archive/2026-05-27-budget-setup/`. Lesson: -.
- **S-02: user can choose a supported bank, import one supported statement format, review parsed transactions, and replace an existing bank-month batch** - Archived 2026-05-30 -> `context/archive/2026-05-29-first-bank-import-review/`. Lesson: -.
- **S-03: user can save reusable categorization rules and see monthly category usage against income and limits** - Archived 2026-05-31 -> `context/archive/2026-05-30-monthly-summary-and-rules/`. Lesson: -.
- **S-04: user can repeat the import-and-review flow with a second supported statement format** - Archived 2026-06-01 -> `context/archive/2026-05-31-second-supported-format/`. Lesson: -.
- **UX-01: user can review many imported transactions efficiently, save category changes in bulk, and clearly see unsaved state** - Archived 2026-06-01 -> `context/archive/2026-06-01-import-review-bulk-categorization/`. Lesson: -.
