# radius

Welcome to the radius plugin!

_This plugin was created through the Backstage CLI_

## Getting started

Your plugin has been added to the example app in this repository, meaning you'll be able to access it by running `yarn start` in the root directory, and then navigating to [/radius](http://localhost:3000/radius).

You can also serve the plugin in isolation by running `yarn start` in the plugin directory.
This method of serving the plugin provides quicker iteration speed and a faster startup and hot reloads.
It is only meant for local development, and the setup for it can be found inside the [/dev](./dev) directory.

## Shared query contract

The default Radius API uses the compiled `@radius-project/core/domain` client.
Backstage owns the Kubernetes proxy, authentication, HTTP errors, and JSON
decoding. The shared client owns resource paths, API-version discovery, namespace
merging, and recipe aggregation.

The default API resolves the first configured Kubernetes cluster and the
`radius/local` plane once per API instance. Resource GET and graph POST requests
use that same context. The existing constructor still accepts one Kubernetes API
argument; its optional second argument supplies an explicit connection and plane.
This adds no picker or configuration UI. Discovery methods retain their explicit
cluster and plane options without changing the instance's default context.
Malformed resource IDs and IDs outside the selected plane fail before proxy
access.

Hosts can still override the public `radiusApiRef`. Existing overrides do not
have to implement the new optional `getApplicationGraph({applicationId, signal})`
method. A graph-capable override returns the public `RadiusApplicationGraph`
shape: `{graph, context}`. `graph` is the unmodified query response; `context`
contains only the actual `connectionId`, `{type, name}` plane, and requested
`applicationId`, never credentials. The core query method still returns only the
raw graph response.

The graph tab never bypasses an API override with a direct Kubernetes POST. An
override without the graph method gets an explicit unsupported-operation error.
The tab checks the returned application and plane, then uses the shared
contextual legacy normalizer and `RadiusGraph`. Route or API replacement aborts
old work and hides old data. A 10-second limit reports an error even if an override
ignores its abort signal; late responses cannot replace that error.

The shared native card shows resource-type icons and the raw provisioning text.
It does not infer deployment success. It shortens the visible type label but
retains the original full type and ID in the DOM. Legend and details popup remain
disabled by default. The separate public `rad-components` compatibility exports
keep compact cards and forward to the same shared renderer; only the data-only
`ResourceNode` entry uses the host's Flow11 provider. Its root barrel exports
`ResourceNode`, so `rad-components` keeps `reactflow` as a required peer, as before.
Only the shared graph package treats Flow11 as an optional peer.
The plugin and forwarding package now declare React/ReactDOM `^18.3.1`, matching
the dashboard and shared renderer. The old React 16/17 peer ranges are not carried
forward as unsupported claims. This change does not add React 19 host support.

Inventory methods retain the `{value}` result envelope. Shared-client results
also include `complete` and `errors`. A partial result keeps available resources
and identifies failed requests; a total failure rejects. The inventory views show
a warning for partial data and an error when an incomplete result has no
resources. Metadata-free host overrides retain their prior contract; the plugin
does not assume that those results prove completeness.

## Development artifacts

Shared library version `0.1.0` is development metadata, not proof of a registry
release. Repository builds use exact vendored compiled archives and relative file
resolutions. See the [candidate preflight instructions](../../docs/contributing/contributing-code/contributing-code-building/README.md#shared-library-candidate-preflight)
for hash, source/build receipt, installed-byte, and qualification requirements.
Public registry distribution remains unqualified until an approved release.

## Phase 4 test ownership

The source identity in `vendor/shared-libraries/candidate.json` fixes the upstream
test versions below. Canonical code and its tests live in those shared packages,
not in a second dashboard parser, query client, renderer, or layout.

| Tier | Shared canonical tests | Surviving dashboard checks |
| ---- | ---------------------- | -------------------------- |
| A: domain/query | `packages/core/src/domain/query.test.ts`, `recipes.test.ts`, `legacy-resource-id.test.ts` | `api/api.test.ts` checks actual compiled-client transport, default/explicit context, errors and cancellation. Recipe adapter, public parser and host link tests retain old input/output contracts, including legal names (#352). |
| A: graph topology | `packages/core/src/graph/live.test.ts`, `legacy-live.test.ts` | `rad-components/src/__test__/graphInvariants.test.ts` calls the public normalizer with independent fixture-owned edges. GU-04/05/06 and #353/#357 positively check diagnostics, owner retention, self-edge removal and duplicate coalescing. |
| B: package/API boundaries | `scripts/test-libraries.mjs`, `scripts/fixtures/libraries/consumer.ts`, `packages/adapter-canvas/test/ci/library-artifacts.test.mjs` | `importBoundaries.test.ts`, `packaging.test.ts`, `packagingArtifact.test.ts`, and `shared-library-candidate.test.ts` check public entries, exact archives/CSS/core/React closure, packed declarations and forwarding exports. |
| C: actual rendering | `packages/graph-react/src/graph.browser.test.ts`, `compat/compat.browser.test.ts`, `styling.browser.test.ts` | `scripts/observe-shared-graph.ts` observes actual public cards/edges/layout in Chromium: GU-07/08/09/10/11/14/19/20, input reversal, remount, controls, real Flow11 handles, and removed CSS/stub negatives. `graphRecords.test.ts` retains GU-21 through GU-25, including committed-to-base diff and exact change approval. Packed root/native hosts retain eight pages, nested routes, real graph, refresh/history and all-card fit/zoom visibility. |

Old Dagre-coordinate and private builder tests were replaced with the public
topology and Chromium checks above. No private presentation/build export is used.
The graph record comparator is test-only. Compact compatibility intentionally
still has no icons, status badges, or details; its pins do not close #35, #89, or
#41. The four approved record removals in `graph-expected-changes.md` each retain a
specific #353/#357 regression. An unrelated change cannot clear those checks.
Frontend registration, catalog/backend composition, and namespace fixtures are
not part of this extraction.

### Removed implementation tests and retained requirements

| Removed Tier E check | Surviving dashboard requirement and evidence |
| -------------------- | ------------------------------------------- |
| `AppGraph.test.tsx`: `initialNodes` leading-row coordinates and case-insensitive built-in classification | A: public normalization topology in `graphInvariants.test.ts`. C: all 14 fixtures, both namespaces, finite/non-overlapping positions and independent input ordering in `observe-shared-graph.ts` (GU-01/02/07/08/09/12/13). Exact local row coordinates are not a public contract. |
| `AppGraph.test.tsx`: React Flow attribution-only render assertion | B: exact public forwarding-function identity. C: actual named cards, directed edges, controls and absent-renderer negative (GU-10/14/20), including packed root/native and forwarding consumers. |
| `AppGraph.test.tsx`: mocked local Dagre failure propagation (GU-17, #368 defect pin) | B: exact forwarding-function identity prevents a second host layout or error policy. Canonical degradation is covered by upstream `packages/graph-react/src/layout.test.ts`; C checks usable finite layout through the public entry. The dashboard does not claim independent private Dagre fault injection or closure of #368. |
| `graphInvariants.test.ts`: private `buildGraphModel` node/edge and layout assertions | A: the same fixture-owned topology, owner retention, raw states and unknown-type requirements now call the public normalizer. C: observed card/edge records, fresh roots, reversed inputs and remounts retain GU-01 through GU-13. Only the four reviewed #353/#357 record removals change the old baseline. |
| `api.test.ts`: local `makePathFor*`/version-policy helper tests | A: compiled-client proxy tests retain connection/plane, version order, provider fallback, inventory, partial errors and pre-I/O rejection. B: packed declarations and public entry/byte closure. Canonical helper tests now belong to upstream `core/domain/query.test.ts`. |
| `ApplicationTab.test.tsx`: direct Kubernetes POST and local timeout tests | A: the mounted real-client GET/POST parity test and `useApplicationGraph.test.tsx` retain overrides, context rejection, route/API cancellation, late response rejection and the timeout. C: packed hosts render the returned real-context graph. |

`ResourceNode.test.tsx` remains as a public compatibility check. Parser and recipe
tests also remain at their public input/output seams; only their implementations
move upstream. No coverage threshold was reduced. Browser qualification does not
run Docker by default or prove production authorization.

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
