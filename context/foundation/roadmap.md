---
project: "Expenses"
version: 1
status: draft
created: 2026-05-25
updated: 2026-05-29
prd_version: 1
main_goal: market-feedback
top_blocker: time
---

# Roadmap: Expenses

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

The first release needs to replace a fragile monthly spreadsheet ritual with one trustworthy web flow: import a supported bank statement, map spending into personal budget categories, and see how spending compares against income-based limits. The sequencing bias is `market-feedback`, so the roadmap favors the earliest end-to-end budgeting loop that proves a user will trust imported data enough to review it, correct it, and come back for the summary.

The main planning constraint is `time`: the PRD sets a 3-week after-hours MVP, so the order below keeps breadth narrow until one complete budget-review loop is working.

## North star

**S-03: User can save categorization rules and see a monthly budget summary** - the north star here means the smallest end-to-end slice whose successful delivery would prove the core product hypothesis, so it is placed as early as its prerequisites allow.

## At a glance

| ID   | Change ID                 | Outcome (user can ...)                                                                                                                        | Prerequisites | PRD refs                                                    | Status   |
| ---- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------- | -------- |
| F-01 | finance-domain-foundation | (foundation) per-user finance records, import batches, categories, limits, rules, and summaries persist under one consistent domain model     | -             | Access Control, Non-Functional Requirements, Business Logic | done     |
| S-01 | budget-setup              | user can define income, custom categories, and percentage-based limits                                                                        | F-01          | FR-001, FR-007, FR-008, FR-009                              | done     |
| S-02 | first-bank-import-review  | user can choose a supported bank, import one supported statement format, review parsed transactions, and replace an existing bank-month batch | F-01, S-01    | FR-001, FR-002, FR-003, FR-005, FR-006, FR-010              | ready    |
| S-03 | monthly-summary-and-rules | user can save reusable categorization rules and see monthly category usage against income and limits                                          | S-01, S-02    | US-01, FR-001, FR-010, FR-011, FR-012                       | proposed |
| S-04 | second-supported-format   | user can repeat the import-and-review flow with a second supported statement format                                                           | S-02          | FR-004                                                      | proposed |

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
- **Status:** ready

### S-03: Monthly summary and reusable rules

- **Outcome:** user can save reusable categorization rules and see monthly category usage against income and limits.
- **Change ID:** monthly-summary-and-rules
- **PRD refs:** US-01, FR-001, FR-010, FR-011, FR-012
- **Prerequisites:** S-01, S-02
- **Parallel with:** S-04
- **Blockers:** -
- **Unknowns:** none.
- **Risk:** This is the first full proof of value, so it should follow import review immediately instead of being delayed by broader format coverage or polish.
- **Status:** proposed

### S-04: Second supported statement format

- **Outcome:** user can repeat the import-and-review flow with a second supported statement format.
- **Change ID:** second-supported-format
- **PRD refs:** FR-004
- **Prerequisites:** S-02
- **Parallel with:** S-03
- **Blockers:** -
- **Unknowns:** none.
- **Risk:** Expanding format coverage too early stretches the MVP before one complete budget loop is proven, but leaving it out would miss a declared must-have requirement.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                 | Suggested issue title                                                          | Ready for `/10x-plan` | Notes                                     |
| ---------- | ------------------------- | ------------------------------------------------------------------------------ | --------------------- | ----------------------------------------- |
| F-01       | finance-domain-foundation | Establish the finance domain foundation for per-user budget data               | yes                   | Run `/10x-plan finance-domain-foundation` |
| S-01       | budget-setup              | Let users define income, categories, and percentage-based limits               | yes                   | Run `/10x-plan budget-setup`              |
| S-02       | first-bank-import-review  | Support first-bank import, transaction review, and bank-month replace behavior | yes                   | Planned and implemented; archive pending  |
| S-03       | monthly-summary-and-rules | Show monthly summary and persist reusable categorization rules                 | no                    | Depends on S-01 and S-02                  |
| S-04       | second-supported-format   | Add a second supported statement format to the import flow                     | no                    | Depends on S-02                           |

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
