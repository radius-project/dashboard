# ADR: Keep the Radius Backstage plugin in dashboard and use shared graph libraries

- **Status**: Proposed
- **Date**: 2026-10-27

Proposed for team review. This record uses minimal MADR. The
[design](./2026-09-radius-backstage-plugin.md#decisions-for-review) owns the review choices, trade-offs and contracts;
the [test plan](./2026-09-dashboard-plugin-test-plan.md) owns acceptance evidence.

## Context and Problem Statement

Standalone and external Backstage hosts need the same Radius pages and API. Domain and graph code
need one implementation. Backstage's frontend migration changes registration, not those product boundaries.
How do we distribute the plugin without copying pages, graph code or host setup?

## Considered Options

- Keep the plugin in dashboard and publish shared libraries from `ai-extensions`.
- Move the plugin and libraries into `ai-extensions`.
- Share only types and keep separate graph implementations.
- Keep Radius on legacy registration behind permanent wrappers.

## Decision Outcome

**Proposed option:** Keep Backstage code in dashboard and consume shared domain/graph libraries.
This keeps Backstage tooling with the product and gives shared code one owner.
[D1-D6](./2026-09-radius-backstage-plugin.md#decisions-for-review) contain the supporting decisions and their open inputs.
No team acceptance or public support range is recorded.

### Consequences

- Both hosts consume the same plugin; replaced implementations must be deleted.
- Native registration needs a tested migration and a bounded legacy support window.
- Library adoption needs coordinated versions, installed-package checks and proven rollback.
- Publication remains blocked on the design's scope, license and support approvals.
