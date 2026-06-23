# Additional Bank Support — Plan Brief

> Full plan: `context/changes/additional-bank-support/plan.md`

## What & Why

Add one exact PKO BP CSV format to the existing import-and-review workflow. This widens bank coverage without changing persistence or review architecture; Santander is deferred until a representative export is available.

## Starting Point

Revolut and ING already use explicit bank selection, bank-specific parsers, and one shared normalized transaction contract. PKO can reuse everything after parsing, but its four unnamed detail columns require label-aware extraction rather than fixed column mappings.

## Desired End State

A signed-in user can choose PKO BP CSV, upload a single-month PLN export, preview meaningful merchant or transfer information, and save or explicitly replace the PKO batch. The committed batch appears in the same history and review surfaces as Revolut and ING.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Current scope | PKO BP only; Santander later | A PKO sample exists and is understood, while Santander has no representative export yet. |
| Format breadth | Exact supplied 11-column CSV export | Keeps parsing trustworthy and testable instead of claiming generic PKO support. |
| Transaction date | `Data operacji` | Reflects when the user performed the transaction and preserves the existing operation-month model. |
| Detail parsing | Scan all description cells for semantic labels | The same unnamed column can contain location, sender/receiver, or title depending on transaction type. |
| BLIK mapping | Location/address as recipient; transaction type as title | The location identifies who was paid, while the labeled PKO title is often only an opaque number. |
| Transfer mapping | Sender/receiver name as recipient; labeled transfer title as title | Preserves the counterpart and user-authored payment purpose for review and rules. |
| Other-row fallback | Transaction type as recipient; primary description as title | Keeps fees understandable without promoting account or reference identifiers. |
| Month handling | Reject multi-month files | Preserves the existing one-bank/month preview and replacement contract. |
| Currency handling | PLN only | Transactions do not store currency, so mixing raw foreign amounts would corrupt summaries. |
| Dispatch | Exhaustive parser selection | Prevents PKO or future banks from silently falling into the ING parser. |

## Scope

**In scope:**

- PKO bank identifier, strict parser, and explicit preview dispatch.
- Label-aware merchant, sender/receiver, and transfer-title normalization.
- PLN-only and single-operation-month validation.
- PKO selection, guidance, page copy, and history label.
- Parser, preview, replacement, persistence, and UI regression tests.

**Out of scope:**

- Santander.
- Generic PKO variants, PDFs, spreadsheets, or automatic bank detection.
- Multi-month splitting, foreign currencies, schema changes, or downstream review redesign.

## Architecture / Approach

Add `pko` at the existing bank/parser seam. `pkoCsv.ts` validates the exact 11-column export and scans its description cells for known labels before emitting the shared `{ transaction_date, title, recipient, amount, cashflow_type }` shape. Preview, commit, replacement, rules, history, and review remain shared.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. PKO Parser Contract | Bank registration, strict parsing, PLN/month validation, exhaustive dispatch | A loose parser could accept a nearby but incompatible export. |
| 2. Label-Aware PKO Normalization | Stable BLIK, transfer, fee, and fallback title/recipient mappings | Poor mappings would weaken review clarity and categorization rules. |
| 3. PKO Upload UI and Regression Coverage | PKO selection, guidance, history label, and full shared-flow verification | Existing Revolut or ING behavior could regress while widening the selector. |

**Prerequisites:** Existing Revolut/ING import-review flow and the two sanitized PKO reference samples.

**Estimated effort:** ~2 implementation sessions across 3 phases.

## Open Risks & Assumptions

- Only the supplied PKO header and row structure are supported; nearby export variants may be rejected.
- Label recognition must tolerate Polish diacritics and the encoding artifacts already handled by existing parsers without weakening header validation.
- Rows without recognized semantic labels rely on explicit fallbacks; new PKO transaction types may need later mapping refinements.

## Success Criteria (Summary)

- A user can import and review the supported single-month PLN PKO CSV.
- BLIK and phone-transfer rows expose useful recipient/title values for review and reusable rules.
- PKO replacement and history use the existing shared workflow, while Revolut and ING remain unchanged.
