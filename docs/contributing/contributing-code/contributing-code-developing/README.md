# Developing components of the Radius Dashboard

This page how to run and develop the Radius Dashboard and its components.

## Developing: Dashboard

**Launch the Dashboard:**

_Run in separate terminals:_

```bash
kubectl proxy
```

```bash
yarn dev
```

You can leave these commands running while you work on the Dashboard. Changes you make will be reflected in the browser pretty immediately.

The Dashboard is configured to look for a Kubernetes API server on `localhost:8001`. Running `kubectl proxy` will open a port-forward to your currently-configured Kubernetes cluster.

This will launch the Dashboard at `http://localhost:3000`.

### Configuration

The configuration for local development (`yarn dev`) is stored in `app-config.local.yaml`. This file is a set of overrides for development that will be combined with `app-config.yaml`. See the configuration file comments for links to relevant documentation.

This file is checked in but `.gitignored`'d. Feel free to make changes as needed.

The `app-config.dashboard.yaml` configuration is used when deployed as part of a Radius installation.

### Frontend migration qualification

The native Radius entry is the default export from `@internal/plugin-radius/alpha`.
The root entry remains available to legacy hosts. Neither entry changes the host's sign-in policy.
Only the standalone app enables automatic guest sign-in.

The current qualification set uses React 18, `@backstage/frontend-defaults` 0.5.6,
`@backstage/frontend-plugin-api` 0.18.1, and `@backstage/core-compat-api` 0.5.15.
These are exact local test versions, not a public support range.

| Required surface | Native entry and pinned version | Host mapping |
| --- | --- | --- |
| Radius | `@internal/plugin-radius/alpha` | Eight pages, Radius API and `radius-catalog` flag |
| Catalog | `@backstage/plugin-catalog/alpha` 2.0.9 | `/catalog` and `/catalog/:namespace/:kind/:name` |
| Catalog graph | `@backstage/plugin-catalog-graph/alpha` 0.6.8 | `/catalog-graph`; entity route bound to catalog |
| Home | `@backstage/plugin-home/alpha` 0.9.10 | `/`; logo, Learn, Community, Support, Applications and Environments cards |
| Settings | `@backstage/plugin-user-settings/alpha` 0.9.7 | `/settings`; appearance, auth providers and feature flags |
| Kubernetes | `@backstage/plugin-kubernetes/alpha` 0.12.23 | Host API factories and entity content; Radius uses the host Kubernetes proxy |

Phase 3B tested the following temporary app adapters. Phase 3C removes them.
The Radius Dashboard maintainers own these changes. No required app adapter or third-party
plugin converter remains.

| Removed adapter | Upstream API reference | Native replacement and checked exit |
| --- | --- | --- |
| `convertLegacyAppOptions` | [App migration](https://backstage.io/docs/frontend-system/building-apps/migrating/) | Native API, theme and sign-in blueprints; real guest sign-in and both themes pass |
| `app/layout` wrapping `Root` | `NavContentBlueprint` in `@backstage/plugin-app-react` 0.2.7 | Native sidebar input; all six links and settings/avatar remain |
| Home page replacement | `HomePageLayoutBlueprint` in `@backstage/plugin-home-react` 0.1.42 | Native home layout input; `/`, all five cards, links and logo remain |

The home page path override sets the default to `/` without replacing native home registration.
The shared Radius cards use `compatWrapper` only for their legacy route hooks. Radius uses the same
supported component context bridge inside its native page extensions. These are not app helpers
or third-party plugin converters. Product code and the legacy root entry remain shared.

The catalog client override belongs to the `catalog` module. Registering it a second time under
`app` causes an API factory conflict in the installed frontend. Its discovery and fetch dependencies
are unchanged. The standalone uses `ProxiedSignInPage` for the guest provider: in this exact
Backstage set, `SignInPage auto` does not auto-select the string guest provider.

Build and test the real standalone host:

```bash
yarn workspace @internal/app build
NODE_ENV=production yarn test:e2e:standalone
```

This check starts the actual six-plugin backend with temporary in-memory databases, a controlled
Kubernetes upstream and the built frontend. It uses the real guest provider and proxy authorization.
It does not read local cluster credentials. Playwright Chromium must be installed
(`yarn exec playwright install --with-deps chromium`). The runner stops the backend and upstream
after the journeys. `yarn test:package` checks both Radius entries from the same packed artifact.

The pre-cutover source base is `9d295b5097c62d9c3fa9dab136172f34c1b912bf`.
Its lockfile Git blob is `7d8981bda1ac345fcbdea29a7f36d992cc559769`.
An immutable rollback image and a successful image restore test are still required for FS-16.
A source build or a mutable `latest` tag does not satisfy that gate.
FS-16 remains open until a previous qualified image can be restored and checked.
The native built host and backend pass the browser journeys, but this is not a completed rollback
qualification or approval to publish a stable package.
The candidate lockfile SHA-256 is
`d6c5282e6d0b8e1bf61385c6273f6186d411d3531369679f7214ad6a5ad7171f`.
Its backend uses `@backstage/backend-defaults` 0.18.0 and `@backstage/plugin-app-backend` 0.5.18.
The candidate frontend uses React 18.3.1. Keep this source revision and lockfile together when
building a candidate image; do not substitute dependencies from a later install.

## Developing: rad-components

**Launch Storybook to experiment with rad-components:**

```bash
yarn workspace @radapp.io/rad-components run storybook
```

This will launch Storybook at `http://localhost:6006`.
