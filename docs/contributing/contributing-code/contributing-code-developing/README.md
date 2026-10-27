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
The guest backend must be available. If sign-in fails, the standalone displays an error instead
of offering the old guest component's legacy-token fallback.

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

The initial pre-cutover source base was `9d295b5097c62d9c3fa9dab136172f34c1b912bf`,
with lockfile Git blob `7d8981bda1ac345fcbdea29a7f36d992cc559769`. This is a historical
source record, not the current candidate. For each candidate, use the source revision and
lockfile recorded together by its successful CI image restore check. Do not substitute
dependencies from a later install. The qualified backend uses `@backstage/backend-defaults`
0.18.0 and `@backstage/plugin-app-backend` 0.5.18; the frontend uses React 18.3.1.

The backend test tools add Dockerode, which requests UUID 10. The root resolution selects
UUID 11.1.1 to address [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
without changing the qualified Backstage versions. This version retains the CommonJS `v4`
API used by Dockerode.

### Image restore qualification (FS-16)

On 2026-10-27, the native candidate passed all nine browser journeys in its container.
The check then stopped that container and restored the previous qualified image on the same
address. All six previous-host journeys passed, including all eight Radius routes, graph
navigation, direct refresh, and failure/timeout states. Both containers used the same temporary
configuration, in-memory databases and controlled Kubernetes upstream. This is an application
image restore check, not a persistent database migration or a stable package release approval.

The restored image was published by the successful
[Build run 40371034010](https://github.com/radius-project/dashboard/actions/runs/40371034010).
That run passed its six container browser tests before publishing the digest below.
Its source revision includes later dependency updates than the implementation branch's original
base. The image revision label and included lockfile were checked; the original base was not
rebuilt and presented as a prior published image.

| Record | Qualified identity |
| --- | --- |
| Previous source revision | `4f243cc02166e1330fe5769683d2a70aca23ded1` |
| Previous lockfile Git blob | `858e8c64a07fc43c8dc52a526eb5cb07c30865fb` |
| Previous image lockfile SHA-256 | `4d89b7d1f7329763297c97c583c3dd798578ad2bdcb52c5d17a6e9176c5a74a8` |
| Previous registry image | `ghcr.io/radius-project/dashboard@sha256:166dcc84f8399b6c7b2e060c22eda390763d9379001e24695a961154679daa44` |
| Historical local candidate source revision | `4d94a3a7ecb39220195b69f727b77a3bff4e1aee` |
| Historical local candidate lockfile Git blob | `3ca86978b5cbbcc3f6ebdc2894bbd150a7044640` |
| Historical local candidate image ID | `sha256:327e762ded68ac3b0408223f31b767d1b784e94e4e3fdb968c0c40a8c7ccc3f0` |

Before any journey runs, the runner reads each image's `org.opencontainers.image.revision`
label and the Git blob ID of its included `yarn.lock`. Both values must match the revision
given on the command line and that revision's `yarn.lock` in Git, or the check fails.

The candidate was built with `yarn build-image` from the checked-in
`packages/backend/Dockerfile` at the candidate revision. The public package registry failed
with a TLS error on this machine, so the build set `IMAGE_NPM_REGISTRY_SERVER`. That value
reaches dependency installation only through a BuildKit secret; it is not in the image layers,
history or configuration. Release builds reject this override.

The candidate image is local and was not published. Anyone with the candidate revision can
rebuild it and repeat the check, but the image ID above is not durable registry evidence.
The Build workflow's container job therefore runs this check on each CI-built candidate image
after its normal browser tests. That job's log is the durable FS-16 record for a revision.

To repeat the check with a local or registry candidate:

```bash
yarn test:e2e:rollback ghcr.io/radius-project/dashboard@sha256:166dcc84f8399b6c7b2e060c22eda390763d9379001e24695a961154679daa44 4f243cc02166e1330fe5769683d2a70aca23ded1 <candidate image ID or image@digest> <candidate revision>
```

The runner accepts immutable image identities, not mutable tags. It runs all current journeys
against the candidate. Then it runs the previous revision's own journeys, taken with
`git archive`, against the restored image. A restored image therefore does not need fixes that
were made after it. The previous revision must exist in the local Git object store. The runner
removes only its own containers, network and temporary files. It does not stop Docker Desktop
or other containers. Legacy root-entry artifact tests remain required until an approved
retirement.

## Developing: rad-components

**Launch Storybook to experiment with rad-components:**

```bash
yarn workspace @radapp.io/rad-components run storybook
```

This will launch Storybook at `http://localhost:6006`.
