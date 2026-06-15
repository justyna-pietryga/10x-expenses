# Full-Width Dashboard Panels - Plan Brief

> Full plan: `context/changes/full-width-dashboard-panels/plan.md`

## What & Why

Implement `UX-08` by widening the authenticated product workspace so desktop users can see more of the dashboard and management surfaces at once. The goal is not a redesign of product behavior; it is a controlled layout pass that reduces wasted horizontal space while keeping text and controls readable.

## Starting Point

The dashboard, budget, and imports pages each hard-code their own `max-w-*` shell, with budget narrower than the others. Their underlying components already support dense operational content, but the page containers and some inner header copy blocks still keep the product feeling tighter than necessary on large screens.

## Desired End State

`/dashboard`, `/budget`, and `/imports` share one wider desktop workspace contract. Data-heavy panels gain meaningful width, while narrative/header copy stays intentionally constrained inside those wider surfaces. Mobile and tablet behavior stay effectively the same as today, with the wider treatment unlocking only at large desktop breakpoints.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Initial route scope | Dashboard, budget, and imports | Treats this as a shared authenticated-shell improvement rather than a one-page tweak. | Plan |
| Desktop width model | Wider capped container | Solves the wasted-space problem without turning screens into edge-to-edge layouts. | Plan |
| Layout ambition | Limited panel rearrangement where clearly useful | Lets the extra width improve density instead of only increasing whitespace. | Plan |
| Tablet behavior | Keep current stacking until large desktop breakpoints | Minimizes responsive risk and preserves already-working smaller-screen behavior. | Plan |
| Readability guardrail | Keep copy blocks constrained inside wider shells | Prevents headers and descriptive text from becoming visually loose on ultra-wide screens. | Plan |

## Scope

**In scope:**
- Shared authenticated workspace width contract
- Route-shell adoption in `/dashboard`, `/budget`, and `/imports`
- Low-risk desktop layout improvements in dashboard and management panels
- Manual viewport verification across common screen sizes

**Out of scope:**
- API, schema, or business-logic changes
- New tablet-first multi-column behavior
- Fully fluid or edge-to-edge layouts
- Reworking public/auth pages into the same shell

## Architecture / Approach

Create one reusable authenticated workspace wrapper or helper and migrate the three target routes onto it. Then tighten panel behavior inside that wider shell: allow data-heavy regions to expand, keep prose constrained with local `max-w-*` rules, and preserve the current mobile/tablet stacking model.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Shared shell contract | One reusable wider desktop shell for protected pages | Inconsistent adoption across routes could leave the product visually fragmented |
| 2. Dashboard and budget behavior | Better desktop density with preserved readability | Wider shells could still feel loose if panel grouping is not adjusted |
| 3. Imports adoption and guardrails | Shared width policy reaches the import workflow safely | Import review layout could regress if desktop spacing interacts badly with existing panels |

**Prerequisites:** `S-03` is already complete; no schema or backend prework is needed.
**Estimated effort:** ~2-3 implementation sessions across 3 phases.

## Open Risks & Assumptions

- A reusable shell abstraction fits the current Astro page structure cleanly.
- Existing component internals are responsive enough that only limited panel rearrangement will be necessary.
- Manual viewport checks remain the primary proof of success because this is a layout-centric change.

## Success Criteria (Summary)

- Desktop users can see visibly more useful content across dashboard, budget, and imports without edge-to-edge sprawl.
- Mobile and tablet layouts remain stable and free of horizontal overflow.
- Header and descriptive copy remain readable even when the surrounding panels become wider.
