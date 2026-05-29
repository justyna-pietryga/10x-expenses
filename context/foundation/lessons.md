# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Use Roadmap Task IDs in Commit Scopes

- **Context**: Git commit message subjects for roadmap-linked work items.
- **Problem**: Commit scopes used the change slug or task name, such as `feat(finance-domain-foundation): ...`, which breaks the direct mapping to roadmap/backlog IDs like `F-01`, `S-02`, or `T-01`.
- **Rule**: When a commit belongs to a roadmap or backlog item, use the item ID in the Conventional Commit scope. Format commit subjects as `<type>(<item-id>): <message>`, for example `feat(F-01): domain migration and RLS`.
- **Applies to**: implement, impl-review, plan, plan-review

## Provide Step-by-Step Manual Verification Guidance

- **Context**: Manual verification gate in `/10x-implement`, especially when a phase ends with human-only checks that are not obvious from the plan wording alone.
- **Problem**: Manual verification prompts can be too terse or abstract, which leaves the user unsure how to perform the check in practice and slows down phase completion.
- **Rule**: During the manual verification gate in `/10x-implement`, translate each manual verification item into clear step-by-step instructions the user can follow directly. Keep the instructions concrete, action-oriented, and tied to the actual UI, command, or file the user should inspect.
- **Applies to**: implement
