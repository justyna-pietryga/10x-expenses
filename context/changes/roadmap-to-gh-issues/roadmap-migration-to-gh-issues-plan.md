# Plan: Save and Execute Roadmap-to-GitHub-Issues Migration

## Summary

The plan file for this work belongs in:

`context/changes/roadmap-to-gh-issues/roadmap-migration-to-gh-issues-plan.md`

This work is change-scoped, not a long-lived foundation doc, so it should live under `context/changes/`.

Execution target:

- Use GitHub Issues as the task management system
- Create 1 tracking issue
- Create 5 roadmap-item issues
- Create 1 milestone: `Expenses MVP`
- Create and apply custom labels as part of migration

## Implementation Changes

### 1. Save the plan artifact

Create:

- `context/changes/roadmap-to-gh-issues/roadmap-migration-to-gh-issues-plan.md`

The plan captures:

- migration goal
- selected issue structure
- selected metadata strategy
- issue title/body conventions
- labels to create
- milestone name
- creation order and verification steps

### 2. Create GitHub backlog metadata

Before creating issues:

- create milestone `Expenses MVP` if missing
- create labels if missing:
  - `roadmap`
  - `foundation`
  - `slice`
  - `ready`
  - `proposed`
  - `north-star`

Reuse existing GitHub default label:

- `enhancement`

### 3. Convert roadmap items into issues

Create 5 issues from `context/foundation/roadmap.md`:

- `F-01 finance-domain-foundation`
- `S-01 budget-setup`
- `S-02 first-bank-import-review`
- `S-03 monthly-summary-and-rules`
- `S-04 second-supported-format`

Issue title format:

- `[F-01] Establish the finance domain foundation for per-user budget data`
- `[S-01] Let users define income, categories, and percentage-based limits`
- `[S-02] Support first-bank import, transaction review, and bank-month replace behavior`
- `[S-03] Show monthly summary and persist reusable categorization rules`
- `[S-04] Add a second supported statement format to the import flow`

Each issue body should include:

- `Roadmap ID`
- `Change ID`
- `Outcome`
- `PRD refs`
- `Prerequisites`
- `Parallel with`
- `Status in roadmap`
- `Risk`
- `Ready for /10x-plan`
- source pointer to `context/foundation/roadmap.md`

Issue metadata:

- all issues: `enhancement`, `roadmap`, milestone `Expenses MVP`
- `F-01`: add `foundation`, `ready`
- `S-01..S-04`: add `slice`, `proposed`
- `S-03`: also add `north-star`

### 4. Create the tracking issue last

Create:

- `Roadmap: Expenses MVP`

Tracking issue body should contain:

- short purpose statement
- pointer to `context/foundation/roadmap.md`
- north star callout for `S-03`
- blocker callout for `time`
- checklist linking to the 5 created issues in roadmap order

This issue gets:

- `enhancement`
- `roadmap`
- milestone `Expenses MVP`

## Execution Order

1. Create `context/changes/roadmap-to-gh-issues/`
2. Save `roadmap-migration-to-gh-issues-plan.md`
3. Create milestone if missing
4. Create labels if missing
5. Create 5 roadmap-item issues and capture issue numbers
6. Create tracking issue referencing those numbers
7. Verify issue count, labels, milestone, and checklist links

## Verification

Validate before migration:

- roadmap still contains exactly `F-01` and `S-01..S-04`
- no conflicting custom labels already exist under alternate names
- no `Expenses MVP` milestone already exists

Validate after migration:

- `gh issue list --limit 20` shows 6 new issues
- all 5 roadmap-item issues are attached to `Expenses MVP`
- tracking issue checklist links to the correct issue numbers
- `S-03` has `north-star`
- `F-01` has `ready`
- all item bodies preserve roadmap metadata and prerequisites

## Assumptions and Defaults

- Change ID for this work: `roadmap-to-gh-issues`
- Plan filename: `roadmap-migration-to-gh-issues-plan.md`
- Language of created GitHub issues: English
- No GitHub Project board, assignees, or sub-issues are created in this migration
- The migration uses `gh` directly against `justyna-pietryga/10x-expenses`
