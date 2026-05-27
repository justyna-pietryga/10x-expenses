# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Use Roadmap Task IDs in Commit Scopes

- **Context**: Git commit message subjects for roadmap-linked work items.
- **Problem**: Commit scopes used the change slug or task name, such as `feat(finance-domain-foundation): ...`, which breaks the direct mapping to roadmap/backlog IDs like `F-01`, `S-02`, or `T-01`.
- **Rule**: When a commit belongs to a roadmap or backlog item, use the item ID in the Conventional Commit scope. Format commit subjects as `<type>(<item-id>): <message>`, for example `feat(F-01): domain migration and RLS`.
- **Applies to**: implement, impl-review, plan, plan-review
