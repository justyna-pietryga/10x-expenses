# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1-§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-02

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the risk wins. Do not promote to e2e because e2e "feels safer." Do not put a vision model on top of a deterministic visual diff that already catches the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team is worried about X, and the failure would surface somewhere in <area>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents what could fail and why we believe it's likely, drawn from documents, interview, and codebase signal. It does NOT claim to know which line owns the failure. That knowledge is produced by `/10x-research` during each rollout phase. If the plan and research disagree about where the failure lives, research is the ground truth.

Hot-spot scope used for likelihood weighting: `src`, `supabase`.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by risk = impact × likelihood. Risks are failure scenarios in user/business terms, not test names. The Source column cites the evidence that surfaced this risk, never a specific file as where the failure lives.

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence - not anchor) |
|---|---|---|---|---|
| 1 | The app shows a monthly summary that looks trustworthy but is materially wrong because parsed or categorized transaction data drifted underneath it. | High | High | PRD lines 20-23, 30-33, 40-42, 90-94; roadmap lines 20-22, 95-105; interview Q1, Q4 |
| 2 | Re-importing the same bank/month leaves the month in a corrupted intermediate state, such as duplicated rows, missing old rows, or a partial replacement instead of one clean batch. | High | High | PRD lines 36-37, 59, 71-72; roadmap lines 83-93; interview Q1 |
| 3 | Bulk review says category changes were applied, but some edits never persist or only partially persist. | High | High | roadmap lines 121-131; interview Q3, Q4; hot-spot dir `src/pages/api` (21 touches/30d); hot-spot dir `src/lib/imports` (18 touches/30d); hot-spot dir `src/components/imports` (14 touches/30d) |
| 4 | Rule or category updates make the review table look correct while mutating the wrong underlying transactions. | High | Medium | PRD lines 49-58, 81-85; roadmap lines 133-143; interview Q4; hot-spot dir `src/components/imports` (14 touches/30d); hot-spot dir `src/pages/api` (21 touches/30d) |
| 5 | A user can access or affect finance data that does not belong to their account because auth or ownership checks are incomplete on finance flows. | High | Medium | PRD lines 40, 90-91, 103-105; roadmap lines 47-52; tech-stack lines 15-19; AGENTS lines 31-34; hot-spot dir `src/pages/api` (21 touches/30d); hot-spot dir `src/components/auth` (6 touches/30d) |
| 6 | Invalid or unexpected import or rule input is accepted server-side, leading to silent bad state instead of a rejected request. | Medium | Medium | PRD lines 41, 92-94; CLAUDE lines 38-39; interview Q1; hot-spot dir `src/lib/imports` (18 touches/30d); hot-spot dir `src/pages/api` (21 touches/30d) |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | A summary reflects persisted reviewed data correctly, and incomplete or invalid review state cannot masquerade as a clean monthly result. | Reasonable-looking totals mean the summary is correct. | Summary input contract, reviewed or unreviewed state rules, persistence boundary | integration | copied production calculation |
| #2 | Re-importing the same bank/month results in one correct batch with no duplicates, missing rows, or orphaned prior state even when replacement fails mid-flight. | Replace behavior is effectively the same as append-then-cleanup. | Batch identity rules, overwrite semantics, persisted side effects, and failure behavior during replacement | integration | happy-path-only import check |
| #3 | Bulk save either persists every intended change or returns a failure that leaves the user with truthful state. | Success UI means persistence succeeded for all rows. | Request and response contract, partial-failure behavior, save lifecycle | integration | UI-only assertion with mocked internals |
| #4 | Rule or category application changes exactly the intended transactions and leaves non-matching rows untouched. | Visible table state is a reliable oracle for underlying mutations. | Match criteria, mutation scope, current-batch behavior | integration | asserting against transformed UI text only |
| #5 | Authenticated users can only read or mutate their own finance data across import, budget, rules, and summary flows. | Logged in is equivalent to authorized for this record. | Ownership model, session shape, per-endpoint access rules | integration | over-mocking auth or session boundaries |
| #6 | Bad import or rule input is rejected server-side with no persisted corruption. | Client validation already guarantees safe input. | Server validation boundary, error mapping, persistence behavior on invalid input | integration | implementation-mirror validator tests |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder via `/10x-new`. Status moves left-to-right through the values below; the orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Critical import and summary integrity | Defend the core data-integrity path for import replacement, summary gating, and summary correctness. | #1, #2, #6 | integration | change opened | testing-critical-import-and-summary-integrity |
| 2 | Review persistence and rule application | Catch review-flow regressions where UI state drifts from persisted state or mutates the wrong rows. | #3, #4 | integration | not started | - |
| 3 | Auth and ownership boundaries | Prove finance flows enforce ownership, not just authentication. | #5 | integration | not started | - |
| 4 | Quality gates and cookbook wiring | Lock the floor with stable suite commands, rollout patterns, and required gates. | cross-cutting | gates | not started | - |

## 4. Stack

The classic test base for this project. AI-native tools, if any, carry a `checked:` date so future readers can see which lines need re-verification. Recommendations in this section are grounded in local manifests/configs plus the tools actually exposed in this session.

| Layer | Tool | Version | Notes |
|------|------|---------|-------|
| unit + integration | Vitest | ^3.2.4 | Configured today, but the suite is sparse and clustered in root `tests/`. |
| API mocking | none yet | n/a | Prefer using the real app boundary in Phase 1 unless research proves edge mocking is cheaper. |
| e2e | none yet | n/a | Use `/10x-e2e` only for risks that genuinely need browser coverage. |
| accessibility | none yet | n/a | No dedicated a11y layer is configured today. |
| AI-native | Browser tool - checked: 2026-06-02 | n/a | Possible verification layer; do not use when deterministic assertions already catch the regression. |

**Stack grounding tools (current session):**
- Docs: none - no docs MCP surfaced in this session; checked: 2026-06-02
- Search: none - no search MCP surfaced in this session; checked: 2026-06-02
- Runtime/browser: browser tool - available as a possible verification layer, not used in discovery; checked: 2026-06-02
- Provider/platform: none - no dedicated GitHub, Cloudflare, or Supabase MCP surfaced; checked: 2026-06-02

## 5. Quality Gates

The full set of gates that must pass before a change reaches production. "Required for §3 Phase <N>" means the gate is enforced once that rollout phase lands; before that, the gate is planned.

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck + build | local + CI | required | syntactic, type, and build drift |
| unit + integration | local + CI | required after §3 Phase 1 | import, summary, and API logic regressions |
| auth or ownership integration checks | local + CI | required after §3 Phase 3 | cross-user access or mutation regressions |
| e2e on critical flows | CI on PR | optional | broken browser-level paths that integration cannot expose cheaply |
| post-edit hook | local (agent loop) | planned after §3 Phase 4 | regressions at edit time |
| pre-prod smoke | between merge + prod | optional | environment-specific failures |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once the relevant rollout phase ships; before that, the sub-section reads "TBD - see §3 Phase <N>."

### 6.1 Adding an integration test for import or summary behavior

- TBD - see §3 Phase 1 for import replacement, summary gating, and summary correctness patterns.

### 6.2 Adding an integration test for review persistence

- TBD - see §3 Phase 2 for bulk-save truthfulness and mutation-scope patterns.

### 6.3 Adding an integration test for auth or ownership checks

- TBD - see §3 Phase 3 for finance-flow ownership boundary patterns.

### 6.4 Adding a test for a new API endpoint

- TBD - see §3 Phase 1 and §3 Phase 3 for the preferred endpoint-level integration pattern in this repo.

### 6.5 Per-rollout-phase notes

- TBD - see §3 Phase 4.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout. Future contributors should respect these unless the underlying assumption changes.

- **Generated types and thin wrappers** - tests here mostly mirror implementation instead of catching business regressions. Re-evaluate if these layers gain meaningful logic. (Source: Phase 2 interview Q5.)
- **Broad snapshot coverage** - high churn and weak signal for the finance risks that matter in this product. Re-evaluate if a stable visual diff target appears. (Source: Phase 2 interview Q5.)
- **External services like Supabase itself** - the rollout should test our contracts and ownership rules, not Supabase internals. Re-evaluate if we add custom platform glue that changes behavior materially. (Source: Phase 2 interview Q5.)

## 8. Freshness Ledger

- Strategy (§1-§5) last reviewed: 2026-06-02
- Stack versions last verified: 2026-06-02
- AI-native tool references last verified: 2026-06-02

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
