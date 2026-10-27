# ADR: Keep the Radius Backstage plugin in dashboard and use shared graph libraries

- **Status**: Proposed
- **Date**: 2026-10-27

Proposed for team review. This decision record uses the minimal MADR format; the
[implementation design](./2026-09-radius-backstage-plugin.md) contains the detailed mappings and contracts.
The [test plan](./2026-09-dashboard-plugin-test-plan.md) defines the required evidence.

## Context and Problem Statement

The standalone dashboard and external Backstage hosts need the same Radius pages and API, while
shared domain and graph code needs one owner. Backstage's new frontend system requires native
plugin registration; the dashboard backend already uses the new backend system.
How do we distribute the plugin without duplicating its product pages, graph implementation, or host setup?

## Considered Options

- Keep the Backstage plugin in dashboard and publish shared libraries from `ai-extensions`.
- Move the Backstage plugin and shared libraries into `ai-extensions`.
- Keep graph implementations in dashboard and share only types.
- Keep Radius on the legacy frontend behind permanent compatibility wrappers.

## Decision Outcome

Chosen option: "Keep the Backstage plugin in dashboard and publish shared libraries from
`ai-extensions`", because it keeps Backstage tooling with the product and gives shared graph code
one owner. The standalone app and external hosts consume the same plugin exports.

`radius-project/dashboard` owns the plugin, product pages, host integration, container, and host tests.
`radius-project/ai-extensions` owns the shared domain and graph libraries, proposed as
`@radius-project/core` and `@radius-project/graph-react`. Core defines browser-safe contracts and
domain operations. Graph-react owns rendering, layout, and scoped styles; it accepts data and
callbacks rather than fetching resources or calling host APIs. The plugin consumes compiled
packages and declarations. Delete replaced dashboard implementations; retain `rad-components`
only as a temporary forwarding package if external consumers need its exports.

Implement Radius natively in the new frontend system, reusing all eight pages, API logic, routes,
feature flag, and optional cards. Keep tested legacy root exports for an approved support window;
the proposed native entry is a default export at `/alpha`. Install Radius exactly once.
Move the standalone app through a tested hybrid stage to native composition. Temporary app and
third-party converters need owners and removal conditions; required compatibility code must be
gone before stable standalone release. Keep dashboard on React 18. Test shared graph support on
React 18 and 19 separately; library results do not qualify a React 19 Backstage host.

Retain the existing native backend and Kubernetes proxy. Do not install or publish the health-only
Radius backend scaffold for the first release. The host owns authentication and must authorize
resource reads and graph queries. Both operations use the same explicitly selected cluster and
Radius plane. Connection settings grant no access, and external installations must not inherit
standalone guest sign-in defaults. Keep live control-plane graphs distinct from modeled graphs
and deployment projections.

Protect extraction with real-renderer browser journeys and reviewed graph-record differences.
Before shared-library changes merge, test packed candidates against a pinned dashboard revision
and external host fixture. Check declarations, dependency resolution, styles, and actual plugin
registration. Publish qualified core, graph-react, and plugin packages in that order. Record
matching package versions, lockfiles, host revisions, and images; rollback restores that tested
set rather than a second implementation.

### Consequences

- One Backstage product serves standalone and embedded installations. Shared graph fixes use one
  implementation instead of separate dashboard copies.
- Native registration removes a permanent compatibility layer while preserving legacy exports
  for a bounded transition.
- Library releases and dashboard adoption require coordinated versions, cross-repository tests,
  and deletion of replaced code. A source build alone cannot qualify an installed package.
- Maintainers must approve package names, registry ownership, licenses, exact host/version
  support, the native subpath, and legacy retirement before publication. This proposal grants no
  untested support promise.
- The first release remains read/inspect only. Deployment, modeling, full catalog integration,
  and a dashboard React major upgrade need separate decisions.
