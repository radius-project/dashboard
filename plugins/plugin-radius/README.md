# radius

Welcome to the radius plugin!

_This plugin was created through the Backstage CLI_

## Getting started

Your plugin has been added to the example app in this repository, meaning you'll be able to access it by running `yarn start` in the root directory, and then navigating to [/radius](http://localhost:3000/radius).

You can also serve the plugin in isolation by running `yarn start` in the plugin directory.
This method of serving the plugin provides quicker iteration speed and a faster startup and hot reloads.
It is only meant for local development, and the setup for it can be found inside the [/dev](./dev) directory.

## Graph tab and shared libraries

The Application graph tab renders with `RadiusGraph` from `@radius-project/graph-react`, built from ai-extensions `main`. The dashboard owns everything that the shared libraries do not export:

- `api/api.ts` is the dashboard's own Radius client. It owns resource paths, API-version discovery, namespace merging, and recipe aggregation. Backstage owns the Kubernetes proxy, authentication, HTTP errors, and JSON decoding.
- `ApplicationTab.tsx` sends the graph POST through the Kubernetes proxy with a 10-second limit. For `Radius.Core/applications` API versions dated `2025-08-01` or later (stable or `-preview`), it sends `{includeIcons: true}`. All other versions send no body.
- `components/resources/legacyGraph.ts` converts the legacy graph payload (`Applications.Core`, Dapr, and `Radius.Core`) to the live graph that `normalizeLiveGraph` accepts. It applies the old edge direction rule, including the gateway and route reversal, before `normalizeLiveGraph` runs. It passes the raw `provisioningState`, the icon hashes, and the icons through. `normalizeLiveGraph` checks the icons and warns about invalid ones.
- The Open control navigates with the host's route reference. An ID that is not a valid resource ID reports an error and does not navigate.

The shared core has no query client and no legacy resource-ID parser, so the dashboard keeps both. The pull request lets the live graph path accept `Applications.Core/applications` and pass resource-definition icons. For this reason the adapter uses the live path. That path shows the raw provisioning text, the details status row, and the warnings. See `vendor/shared-libraries/candidate.json` for the limits.

The public `rad-components` `AppGraph` still uses its own React Flow 11 renderer, as it did before Phase 4. The plugin and its package declare React and ReactDOM `^18.3.1`, because `graph-react` requires it.

Inventory methods keep the `{value}` result envelope.
## Page appearance

All eight Radius pages use the native dashboard's light or dark theme inside
the page boundary. They follow the host's current light/dark choice. The plugin
does not change the host's navigation, Catalog, Settings, or global CSS baseline.
No host palette changes are needed. Both the root and `/alpha` entries use the
same page components, including loading and error states.

The public `radiusThemes.light` and `radiusThemes.dark` exports also supply the
native dashboard's app themes. This keeps page colors, typography, and header
backgrounds in sync without a second theme definition.

## Development artifacts

Shared library version `0.1.0` is development metadata, not proof of a registry release. Repository builds use two vendored archives, built from ai-extensions `main`, and relative file resolutions. `vendor/shared-libraries/candidate.json` records the source revision, hashes, build commands, and licenses. See the [candidate preflight instructions](../../docs/contributing/contributing-code/contributing-code-building/README.md#shared-library-candidate-preflight) for the checks. Public registry distribution remains unqualified until an approved release.

## Test ownership

- `legacyGraph.test.ts` covers the adapter: edge direction, dropped connections, duplicates, raw status, and icons.
- `ApplicationTab.test.tsx` covers the request body rules, the 10-second limit, navigation, and the live graph and context passed to `RadiusGraph`.
- `graphInvariants.test.ts` and `graphRecords.test.ts` keep the dashboard's graph topology records. The four record entries in `graph-expected-changes.md` declare the pre-Phase-4 records that this branch restores.
- `importBoundaries.test.ts`, `packaging.test.ts`, and `packagingArtifact.test.ts` check public entries and the packed plugin.
## Phase 5 installed-host evidence

`yarn test:package` remains a linked-dependency smoke
check. Do not use it to qualify a clean external host.

Run `yarn test:e2e:installed` with `QUALIFICATION_EVIDENCE_DIRECTORY` set to a
persistent absolute path outside the checkout. Each run builds new plugin and
forwarding tarballs, installs all frontend dependencies in a new consumer, and
uses the same production browser journeys for the packed root and `/alpha`
entries. Native Radius uses explicit feature registration, not a Radius plugin
converter. The fixture host owns navigation, external route bindings, and its
test identity. No automatic guest sign-in is enabled.

The runner retains `commands.json`, command logs, `tuple.json`, archives, an
installed lockfile, production `browser/metafile.json`, HTTP evidence, and graph
records. Only a successful run writes `qualification.json`. By default,
its scope is `installed-external-frontend`; `phase5Complete` stays `false`. Its exact package
versions and lockfile hashes are evidence of one tuple, not a support range or a
decision on D2 or D5. The vendored shared candidates and graph records do not
change. Publication remains out of scope.

Set `QUALIFICATION_CONTAINER_IMAGE` to an already built local dashboard image
to repeat the **same installed legacy/native journeys** through its real
new-system backend and Kubernetes proxy. The controlled upstream verifies the
selected cluster credential and serves the same fixture data. The browser
uses the host-owned fixture identity; the backend accepts its controlled static
token only for the Kubernetes plugin. This pins a test auth tuple, not a
production identity provider. No browser request interception is used.

Container mode also checks explicit startup failure when required Kubernetes
initialization config is missing. Both resource GET and graph POST must reach
the upstream when allowed and return 403 when denied. List and graph errors
must remain visible. Missing authentication must return 401. Evidence includes
the image ID/labels, config, backend stdout/stderr, startup failure, and upstream
request results. The container runs with `NODE_ENV=production`, without source
mounts, package pulls, or the health scaffold. It requires a Linux Docker daemon
with host networking. The existing native standalone suite can also run against
that image, but its four baseline tests do not close the full matrix.

Set `QUALIFICATION_FULL_HOST_MATRIX=true` as well to build and qualify the
complete active matrix. The clean consumer then also contains the actual
standalone app and backend host composition. Only host code is copied: Radius,
the forwarding package, and both shared libraries still come from the four
tarballs. No plugin workspace or source alias is available. The clean host
compiles with the installed compiler and declarations, and the normal Backstage
backend build also builds its frontend. The runner uses that compiled backend
composition for native standalone checks. Root config and logging are controlled
test services; the six actual backend plugins are not mocked.

When a container image is requested in full-matrix mode, the runner builds a
new local `radius-phase5-installed:<plugin-digest>` image from that clean host
with the unchanged production Dockerfile. It does not publish an image or use
the supplied image as a substitute for this build. Both the clean standalone
and this built image run the same eight-route, real-graph journey at root and
`/nested` app base paths, with the plugin at `/plugins/radius`. Their existing
host-feature baseline also runs, including the actual catalog graph-to-entity
external binding.

The shared backend contract checks 24 combinations: two connections, GET and
graph POST, missing/invalid/valid host auth, and allowed/selectively denied
policies. Each forwarded request must use only the selected upstream URL and
its credential. Missing or invalid auth must not reach either upstream.
Discovery and catalog must work, and `/api/radius/health` must remain absent.
The clean backend also rejects a plugin with a missing required service.
Container startup must reject failed Kubernetes initialization.

The installed native fixture decorates the public `radiusApiExtension` factory
without replacing the shipped Radius client. It selects the second real
connection, checks GET/POST and visible denials, mounts/removes/restores the
exported cards, checks card route-ref links, and verifies light/dark host theme
changes in computed card styles. This named extension is exported from `/alpha`
so a host can use the typed override seam even when the inferred plugin
extension map does not expose a typed `getExtension` key.

A successful full-matrix run with the newly built container writes
`phase5Complete: true`. This means the listed Phase 5 gates passed on that exact
test tuple, not that Phase 7/8 accessibility, real Radius/auth, publishing, D2,
or D5 are approved. Full-matrix runs need a working native SQLite build toolchain
and enable dependency build scripts in the clean consumer.

The table maps executable checks, not a claim that every gate has passed.
Full closure below requires full-matrix mode with a container.

| Requirement | Executable evidence | Remaining scope |
| --- | --- | --- |
| HU-01 | `qualify-plugin-host.ts --installed`: actual legacy/native `createApp`; same journey drives clean standalone/container production output; browser errors fail | One pinned tuple, not a support range |
| HU-02 | Shared journey visits all eight headings for every active host and base path | None in the controlled matrix |
| HU-03 | External fixture follows a real bound applications ref; standalone/container baseline follows catalog graph's bound entity ref | Catalog baseline uses controlled entity responses |
| HU-04 | Named host/sidebar links must exist with exact accessible names | Full accessibility audit belongs to Phase 7 |
| HU-05 | Fixture and real standalone sidebar links call `useRouteRef`; browser checks destinations | Host-owned Home/Settings paths are unchanged |
| HU-06 | All active hosts mount Radius at `/plugins/radius` | None in the controlled matrix |
| HU-07 | Each active host runs with root and `/nested` app base paths; real ingress strips the base path for static assets | None in the controlled matrix |
| HU-08 | Same candidate archive supplies packed root and `/alpha`; clean standalone/container use `/alpha` | No temporary hybrid support promise |
| HU-09 | Host-owned fixture identity supplies HTTP credentials; real backend rejects missing identity | Controlled fixture/static auth is not a production provider |
| HU-10 | Real proxy GET/graph POST return upstream 403; list and graph errors remain visible; shared 24-case connection contract | Controlled auth/upstream only |
| HU-11 | All active hosts reuse one Phase 3/4 journey with host-specific transport and sign-in setup | Existing host-feature baseline is additional evidence |
| HU-12 | Actual six-plugin backend, missing-service rejection, failed initialization exit, discovery/catalog, and two-connection GET/POST isolation; scaffold 404 | Real production providers belong to Phase 8 |
| IA-01 | Clean consumer installs four tarballs; only app/backend host code is copied; plugin build inputs must stay inside consumer | Private backend is not published as a plugin |
| IA-02 | Installed declarations/fixtures and clean host compile; production frontend/backend build; clean production Dockerfile build | `skipLibCheck` is retained, not full dependency declaration checking |
| IA-03 | Exact direct/plugin/forwarding/graph-transitive candidate resolution in the complete clean host tree | Recorded installed lock is part of the tuple |
| IA-04 | Compiled shared inputs are required; workspace source and Flow11 browser inputs fail | Continue public forwarding-contract and import-boundary tests |
| IA-05 | Complete clean host tree must contain one React and one ReactDOM copy; image uses its built frontend | No React 19 host claim |
| IA-06 | Exact archive CSS bytes, build input/output CSS, loaded browser rules and computed graph controls in all active hosts; altered CSS fails | None in the controlled matrix |
| IA-07 | Actual registration/routes, clean six-plugin backend, real Kubernetes proxy and shared connection contract against fake upstream | Real Radius belongs to Phase 8 |
| IA-08 | Static production bundles and actual built container; no dev server or mocked shared renderer | None in the controlled matrix |
| RX-01 | Whole clean dashboard tree has one React 18 pair; duplicate/non-18 host peers fail | Exact recorded tuple only |
| RX-02 | Every active host uses shared cards, edges, fit/zoom; forwarding observer also runs | No isolated-library result substitutes for a host |
| RX-03 | A React 19 negative test fails the host tree check | No React 19 Backstage support claim |

`scripts/installed-host.test.ts` checks duplicate resolution, duplicate React,
React 19, missing shared/CSS build inputs, old renderer inputs, and inputs outside
the clean host. `shared-library-candidate.test.ts` retains the exact-byte and
missing-file checks. `observe-shared-graph.ts` retains actual missing-CSS and
stub-renderer browser controls. These negative tests must not be replaced with
successful imports or a placeholder graph.

The temporary hybrid host is not a permanent support requirement. An
external-only run or standalone/container baseline is not full qualification.
Use the full-matrix receipt and its command results, not a packed smoke test,
to determine which gates passed.
