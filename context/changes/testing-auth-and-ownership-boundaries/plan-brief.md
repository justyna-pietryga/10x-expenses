# Auth and Ownership Boundaries — Plan Brief

> Full plan: `context/changes/testing-auth-and-ownership-boundaries/plan.md`

## What & Why

This plan implements Phase 3 of the finance test rollout: proving that authenticated users can only read or mutate their own finance data. The gap today is not basic authentication, but contract-level ownership proof across imports, budget, rules, and dashboard summary flows.

## Starting Point

The repo already has strong ownership-oriented building blocks. Finance routes require auth through shared HTTP helpers, most data helpers scope queries with `user_id`, and the schema uses composite ownership relationships plus RLS policies. What is missing is a dedicated suite that proves those guarantees across the full finance surface and a deliberate contract for cross-user denial.

## Desired End State

When this plan is complete, one dedicated Phase 3 suite will prove finance ownership boundaries end-to-end at the helper and route seam. Cross-user item and mutation attempts will fail with explicit `403` responses where this phase chooses that contract, and summary reads will be proven immune to another user's categories, incomes, batches, transactions, rules, and cached summaries.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Finance scope | Full finance surface | Phase 3 should match the rollout risk and cover imports, budget, rules, and summary rather than a partial subset. | Plan |
| Cross-user denial contract | Targeted explicit `403` | The user chose clearer ownership-denial semantics, but only at selected boundaries to keep the blast radius controlled. | Plan |
| Primary seam | Helper + Astro route integration | This matches Phases 1 and 2 and gives the best cost-to-signal ratio for ownership work. | Research / Plan |
| Summary coverage | Read isolation, not auth-only | Ownership on the read side is subtle and must prove that another user's data cannot influence the dashboard result. | Plan |
| Suite organization | Dedicated Phase 3 suite | A standalone suite keeps the rollout auditable and avoids blurring ownership work into older phase files. | Plan |

## Scope

**In scope:**
- dedicated ownership integration suite
- targeted helper and route contract changes for explicit `403`
- budget, import, rule, and summary ownership coverage
- cookbook and rollout-status updates in `context/foundation/test-plan.md`

**Out of scope:**
- browser or Playwright expansion
- Supabase RLS platform testing
- broad auth-model or middleware redesign
- unrelated Phase 1 or Phase 2 regression work

## Architecture / Approach

The plan stays at the existing integration seam: direct helper calls plus direct Astro route invocation using multi-user in-memory Supabase stubs. Production code changes are limited to places where the app must distinguish unauthenticated (`401`), forbidden cross-user (`403`), and genuinely missing (`404`) outcomes truthfully.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Ownership harness | Dedicated Phase 3 suite and multi-user fixtures | Weak or ambiguous ownership fixtures make later assertions unreliable |
| 2. Contract changes | Targeted `403` ownership behavior in helper and route layers | Accidentally converting ordinary not-found cases into forbidden |
| 3. Budget and imports | Full ownership coverage for the two broadest finance surfaces | Missing a direct-id mutation path in imports |
| 4. Rules and summary | Rule ownership and read-side summary isolation coverage | Proving read isolation without drifting into implementation-choreography tests |
| 5. Cookbook alignment | Reusable Phase 3 guidance and truthful rollout status | Letting the artifact turn into a changelog instead of guidance |

**Prerequisites:** existing Phase 1 and Phase 2 suites remain available as regression baselines; no schema change is required.
**Estimated effort:** ~2-3 implementation sessions across 5 phases

## Open Risks & Assumptions

- The current helper design may need small preflight lookups to distinguish foreign-owned records from missing records cleanly.
- Some existing tests may need targeted expectation updates if they implicitly relied on the old hidden-404 ownership behavior.
- Summary isolation stubs must be rich enough to prove non-interference across months, transactions, rules, and cached summaries.

## Success Criteria (Summary)

- A dedicated ownership suite proves authenticated users cannot read or mutate another user's finance data.
- Targeted cross-user paths return explicit `403` while unauthenticated and genuinely missing cases keep their existing meanings.
- The Phase 3 cookbook entry tells future contributors exactly where and how to add ownership-boundary tests.
