# Radius Dashboard plugin test plan

- **Author**: Nicole James (@nicolejms)
- **Status**: Draft, proposed for team review
- **Revised**: 2026-10-27
- **Design**: [Implementation design](./2026-09-radius-backstage-plugin.md)
- **Decision summary**: [Proposed ADR](./2026-10-radius-backstage-plugin-adr.md)

## Review guide

This plan owns test requirements and evidence. The design owns architecture, API contracts, security, compatibility and release mechanics. Follow its [D1-D6 review agenda](./2026-09-radius-backstage-plugin.md#decisions-for-review) for those choices; do not approve them through a test assertion.

Read the opening decisions, host matrix and phase table first. Reviewers of graph extraction also need [record-change controls](#appendix-e-graph-fixtures-and-records). CI owners need the [candidate protocol](#appendix-h-candidate-ci-protocol). Namespace changes have a separate [NS catalog](#namespace-migration-ns-01-ns-10).

Phases 0-3 below record the qualified legacy baseline in this documentation branch. Later rows define required evidence, not an implementation progress report or a support promise. A passing legacy package does not qualify a native entry or a release. [Appendix J](#appendix-j-baseline-evidence) keeps historical measurements out of the review path.

## Decisions for test review

All choices remain proposed. Record the owner, date and result in this table after review.

| ID  | Choice                     | Options and recommendation                                                                                                                            | Required input / status                                                                                            |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| T1  | Phase 6 coverage targets   | Adopt [Appendix G](#appendix-g-coverage-policy) targets / choose measured targets. Raise from actual results; never lower a stronger floor            | Test owners approve targets and base-revision comparison; Open                                                     |
| T2  | Runner after extraction    | Keep Jest / move to Vitest separately. Keep the runner stable through Phase 4; reconsider only with a frozen baseline and supported Backstage tooling | Maintainers confirm later review point; Deferred proposal                                                          |
| T3  | Loaded-machine timeouts    | Keep 5000 ms / raise selected timeouts. First compare default workers with `--maxWorkers=2`; keep #360 open and fix any CI recurrence                 | Test owners approve a change only with timing evidence; Open                                                       |
| T4  | Shared consumer invocation | Invoke dashboard-owned journeys at its pinned commit / add a shared harness package. Prefer invocation from the dashboard, not copied tests           | CI owners must define the invocation path, exact required jobs/results, pin-age window and pin-refresh owner; Open |

Coverage percentages are not architecture decisions. Names, licenses, host versions, adapter exits and namespace timing are inputs from design D2/D5/D6.

## Host matrix

Pin each host's Backstage version, lockfile, compiler, React version, auth policy and plugin entry. All Backstage rows use qualified React 18. Isolated React 19 library results do not qualify a host.

| Host                                  | Radius entry                                        | Required evidence                                                                                                           |
| ------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Supported legacy external fixture     | Packed legacy root                                  | Public contract and shared journeys through the approved legacy support window                                              |
| Native external fixture               | Packed approved native subpath                      | Actual registration/discovery, nested/non-root mounts, API override, cards, themes and host-owned auth; no Radius converter |
| Hybrid standalone, temporary          | Native Radius with tracked app/third-party adapters | Existing host features work, without duplicate registration; required for 3B, not stable support                            |
| Native standalone and built container | Native Radius and host composition                  | Required journeys pass without required legacy helpers/converters; required for 3C and stable release                       |

All rows use a qualified new-system backend. A legacy backend is not an initial promise; frontend conversion cannot qualify it. Test app, proxy, auth, guest provider, catalog and Kubernetes backend composition. The unregistered health-only Radius scaffold is a maintenance target, not a release dependency.

## Verification phases

The design's [P-unit table](./2026-09-radius-backstage-plugin.md#appendix-d-delivery-and-release) owns implementation work and estimates. These rows own acceptance evidence and prerequisites.

| Phase                               | Prerequisite                                       | Evidence required to close                                                                                                                                                 |
| ----------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Record baseline, done            | Original source                                    | Appendix A inventory; measured root coverage floors; deliberately raising a floor fails the named group                                                                    |
| 1. Close behavior gaps, done        | 0                                                  | RU and component cases, BE-01-BE-05, backend/app entry tests; substantive gaps in Appendix F closed                                                                        |
| 2. Freeze graph baseline, done      | 1                                                  | Real-renderer GU-01-GU-25, CN-01-CN-08, ER-01-ER-10; committed records, empty manifest, renderer/CSS removal fails                                                         |
| 3. Current plugin artifact, done    | 0; can overlap 2                                   | PU source/dist/type contracts, executable API factory, all eight lazy routes, isolated build/pack and restored manifests; no approval of final publishing settings         |
| 3A. Native Radius and backend audit | Design P8a inputs; legacy baseline                 | FS-01-FS-08 and BS-01-BS-04; removing a page/API extension fails; legacy entry still passes                                                                                |
| 3B. Hybrid standalone               | 3A and frozen host journeys                        | FS-09-FS-12 with real backend; adapter inventory includes exact version, missing surface, mapping, owner, upstream reference and exit; prior tuple recorded                |
| 3C. Native standalone               | 3B; native replacements for every required feature | FS-13-FS-16 in built output, including actual prior-image restoration; no required app/third-party converters                                                              |
| 4. Shared-package adoption          | 2; qualified core/graph-react candidates           | PB checks, GU-22-GU-25, reviewed record diff; zero duplicate parser/query policy/layout/renderer; PU-29 if forwarding survives                                             |
| 5. Installed hosts                  | 4; qualified artifacts; 3A for native row          | HU-01-HU-12, IA-01-IA-08, RX-01-RX-03 across the active host matrix; missing shipped files or a toy graph fail                                                             |
| 6. Required CI gates                | Earlier checks exist                               | CP-01-CP-05, required contract/artifact/native/backend/record jobs, approved floors and no-decrease checks; bounded redacted failure evidence                              |
| 7. Accessibility and reliability    | 5; namespace timing from D6                        | E2E-01-E2E-20, Appendix D visuals, no serious/critical axe findings in either theme; three consecutive stable scheduled runs                                               |
| 8. Release qualification            | All launch gates, including 3C                     | HOST-01-HOST-08 in built published standalone/external hosts on disposable Radius/cluster; auth, absent-control-plane and cleanup checks; no skipped/simulated substitutes |
| 9. Namespace corpus                 | D6; separate from 1/2/4, normally after 4          | NS-01-NS-10; reviewed Tier C changes then empty manifest; explicit reasons for retained legacy fixtures                                                                    |

Stable release requires 3C, not only hybrid success. Phase 5's real build qualifies production loading; transformed Jest backend tests do not. Required check configuration, not a green optional job, closes Phase 6.

## Working rules and checks

- Add focused tests with behavior changes. Freeze behavior before refactoring; split intentional product changes from extraction.
- Test public consumer behavior through package entries. Deep imports are for internal helpers only. Preserve Appendix A unless a separate approved change updates it.
- Mount the actual plugin and renderer. Accessible names/roles and visible relationships are contracts; CSS classes, React Flow/Dagre internals and Material-UI structure are not.
- Use declared fake upstream responses. Unexpected requests fail. No personal kubeconfig, live cluster, control-plane network access or CDN assets in unit/component/contract checks.
- Keep loading, empty, partial, stale and error states distinct. External failures stay failures. Close servers, timers, browsers and Storybook processes after success or failure.
- Install one Radius entry/API factory per host. Native and converted composition must not duplicate routes, flags, navigation or API registration.
- Non-browser tests do not retry. Browsers may retry once for diagnostics; the first failure stays visible and a retry-only pass is flaky. Quarantine requires issue, owner, narrow scope and end condition.

| Change                                              | Smallest required checks; expand when a boundary changes                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------- |
| Domain, API path/version, merge or fallback         | L1 plus request/error requirements                                               |
| Page, tab, table, card, icon or interaction         | L2 states/names; L5 keyboard/accessibility from Phase 2                          |
| Exports, routes, apiRefs, flags or package metadata | L3; build/pack/type checks; installed artifact if shipped contents change        |
| Graph model, layout or rendering                    | Invariants, real Chromium semantics and record diff; visual review after Phase 7 |
| Host wiring, native entries, discovery, adapters    | Active host matrix, FS and BS; do not hand-mount pages                           |
| Backend registration, service/auth/proxy policy     | Real startup and allowed/unauthenticated/forbidden GET/graph POST                |
| Shared-package or build/dependency change           | Installed-artifact checks and candidate CI through real built hosts              |
| Release                                             | Phase 8 real Radius/auth matrix and coherent rollback evidence                   |

Run affected focused tests while working. The standard source-change check remains:

```console
yarn install --immutable
yarn tsc
yarn lint:all
yarn format:check
yarn test:all
yarn build:all
yarn test:e2e
```

Run `yarn test:package` separately and serially, never inside repository Jest: Backstage prepack rewrites manifests. CI is authoritative for container/control-plane qualification. If `yarn` is provided through Corepack, use `corepack yarn` for the same commands.

### Test layers and runners

| Layer | Scope                                           | Existing runner                                             |
| ----- | ----------------------------------------------- | ----------------------------------------------------------- |
| L1    | Pure domain/API rules                           | Jest 30, node                                               |
| L2    | Pages, tabs, cards and states                   | Jest/jsdom, RTL, jest-dom, user-event, Backstage test-utils |
| L3    | Plugin/package contracts                        | Jest, node                                                  |
| L4    | Host integration                                | RTL plus packed-install fixture                             |
| L5    | Real browser, graph, keyboard and accessibility | Playwright 1.62, Chromium                                   |
| L6    | Semantic graph records                          | One normalizer plus fixture/model and browser checks        |
| L7    | Reviewed visuals                                | Storybook and Playwright                                    |

Use MSW for HTTP boundaries and `jest-canvas-mock` only for missing HTML canvas APIs in jsdom. A canvas stub cannot prove graph layout. Shared libraries use Vitest; the packed-consumer gate must cross that runner/module boundary rather than copy upstream tests.

### Graph tiers

| Tier | Contract                                                                                             | During extraction                                                                                        |
| ---- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| A    | Invariants: exact topology, valid endpoints, determinism, finite non-overlapping independent layouts | Keep correct assertions unchanged                                                                        |
| B    | Observable names, relationships, controls and states in real Chromium                                | Change only through approved product behavior                                                            |
| C    | Sorted semantic record                                                                               | Change only through reviewed expected-change entries                                                     |
| D    | Screenshot                                                                                           | Human review and stated product reason                                                                   |
| E    | Old implementation details                                                                           | Delete with replaced code; cite surviving A/B/C coverage and move canonical shared tests, without copies |

`KNOWN-DEFECT` pins record incorrect behavior, not desired correctness. A linked fix replaces its own pin with a positive regression and reviewed record changes; it must not weaken unrelated requirements. GU-08 now checks independent per-call layout after #355, not the old leak.

## Appendices

### Appendix A: public and request inventory

This is the reviewed legacy consumer surface. The root inventory includes the Phase 3 API exports; native extension IDs/paths need a separate approved inventory. Preserve the legacy baseline while adding it.

| Surface                             | Exports / value                                                                                                                                                                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plugin/pages                        | `radiusPlugin`, `ApplicationListPage`, `EnvironmentListPage`, `EnvironmentPage`, `RecipeListPage`, `ResourceListPage`, `ResourcePage`, `ResourceTypesListPage`, `ResourceTypeDetailPage`                                                 |
| Route refs                          | `applicationListPageRouteRef`, `environmentListPageRouteRef`, `environmentPageRouteRef`, `recipeListPageRouteRef`, `resourceListPageRouteRef`, `resourceTypesListPageRouteRef`, `resourceTypeDetailPageRouteRef`, `resourcePageRouteRef` |
| Components                          | `RadiusLogo`, `RadiusLogomarkReverse`, `ApplicationIcon`, `EnvironmentIcon`, `ResourceIcon`, `RecipeIcon`, `ApplicationListInfoCard`, `EnvironmentListInfoCard`                                                                          |
| Flag/API                            | `featureRadiusCatalog` = `radius-catalog`; `radiusApiRef` = `radius-api`; public `RadiusApi` type                                                                                                                                        |
| Internal, not promised root exports | `rootRouteRef`, `RadiusApiImpl`                                                                                                                                                                                                          |
| rad-components predecessor          | `AppGraph`, `ResourceNode`, `parseResourceId`, types `AppGraphData`/`ResourceId`; inventory external `@radapp.io/rad-components` consumers before removal                                                                                |

Pages: applications list; environments list and detail (overview/details/resources); resources list and detail (overview/details/application); resource types list/detail; recipes list.

RU-08-RU-14 protect the resource request inventory:

| Operation                   | Path shape                                                                   | API version                  |
| --------------------------- | ---------------------------------------------------------------------------- | ---------------------------- |
| Resource by ID              | `/apis/api.ucp.dev/v1alpha3{id}?api-version=...`                             | Best version for parsed type |
| List by type                | `/planes/radius/local[/resourceGroups/{g}]/providers/{type}?api-version=...` | Best per type                |
| Applications / environments | List by type for both `Applications.Core` and `Radius.Core`                  | Best per type                |
| Resource groups             | `/planes/radius/local/resourceGroups`                                        | `2023-10-01-preview`         |
| Group resources             | `/planes/radius/local/resourceGroups/{g}/resources`                          | `2023-10-01-preview`         |
| Providers                   | `/planes/radius/{plane}/providers`                                           | `2023-10-01-preview`         |
| Type detail                 | `/planes/radius/{plane}/providers/{ns}/resourceTypes/{type}`                 | `2023-10-01-preview`         |

Pin discovery fallback `2023-10-01-preview`, skipping `Microsoft.Resources/deployments`, first-seen ID de-duplication, first rejection only on total equivalent-type failure, and `fixupResource` back-filling environment from the application. The design owns the [graph-query contract and future common boundary](./2026-09-radius-backstage-plugin.md#api-design-if-applicable); FS-02 still tests its existing `ApplicationTab` path before extraction.

### Appendix B: requirement catalog

IDs are stable. "Baseline" means a test exists in the recorded phase, possibly as a defect pin; it does not mean the desired product behavior is implemented. Phase 3A onward and shared-package requirements need their own qualification evidence.

#### Domain and API: RU-01-RU-14

| ID    | Requirement                                                                                              |
| ----- | -------------------------------------------------------------------------------------------------------- |
| RU-01 | Parse well-formed IDs into plane, group, type and name                                                   |
| RU-02 | Reject malformed/empty/partial IDs; retain legal-name rejection pins until the linked parser fix         |
| RU-03 | Map application/environment equivalence between `Applications.Core` and `Radius.Core` in both directions |
| RU-04 | Unknown type takes the single-type path with no equivalents                                              |
| RU-05 | Resource accessors handle absent, empty and partial properties                                           |
| RU-06 | Recipe aggregation groups by type/name and is stable with duplicates                                     |
| RU-07 | An environment without recipes is valid                                                                  |
| RU-08 | Every Appendix A operation uses the declared path/version                                                |
| RU-09 | Discovery failure falls back to `2023-10-01-preview` without throwing                                    |
| RU-10 | Equivalent-type merge de-duplicates IDs in first-seen order                                              |
| RU-11 | Partial equivalent-type failure returns successful results                                               |
| RU-12 | Total equivalent-type failure throws the first rejection                                                 |
| RU-13 | Non-OK proxy response throws with status and body                                                        |
| RU-14 | Missing connection gives setup guidance, not an empty success; intentional correction from the baseline  |

#### Connections: CN-01-CN-08

CN-02-CN-08 include baseline defect pins. CN-03/CN-04 record #356's first/last-cluster split; CN-05 also distinguishes ignoring a late result from cancelling the request.

| ID    | Required behavior                                                                    |
| ----- | ------------------------------------------------------------------------------------ |
| CN-01 | Select the only configured connection automatically                                  |
| CN-02 | Require explicit selection among multiple connections                                |
| CN-03 | First/last ordering of two clusters cannot change the selected connection            |
| CN-04 | Resource GET and graph POST use that same selection                                  |
| CN-05 | Connection change cancels in-flight work and rejects late responses                  |
| CN-06 | Cache keys, saved filters and links are connection-scoped; same names cannot collide |
| CN-07 | Select plane explicitly, not implicitly `radius/local`                               |
| CN-08 | Invalid/removed selection gives an actionable error                                  |

#### Error states: ER-01-ER-10

Keep separate requirements, in order, for no connection, invalid selection, unauthenticated, forbidden, not found, unsupported version, malformed payload, partial inventory, timeout and unavailable upstream. ER-08 requires a partial marker and retry action, never "no resources." Do not retry authorization failures or switch clusters automatically.

#### Package and host requirements

| ID    | Requirement                                                                |
| ----- | -------------------------------------------------------------------------- |
| PB-01 | Plugin imports public core/graph-react entries only                        |
| PB-02 | No host-adapter private-source imports                                     |
| PB-03 | Browser-safe subpaths only; no root barrel reading `process`               |
| PB-04 | Host imports only approved plugin root/native entries                      |
| PB-05 | No dashboard copy of a core-owned contract                                 |
| IA-01 | Clean fixture installs candidate tarballs without workspace/source aliases |
| IA-02 | Installed declarations compile; frontend/backend build                     |
| IA-03 | Direct and transitive resolution uses the candidates                       |
| IA-04 | No old rad-components implementation satisfies graph imports               |
| IA-05 | Resolved tree contains no duplicate peer React                             |
| IA-06 | Candidate CSS is in built output and loaded in browser                     |
| IA-07 | Actual plugin registration/routes work against fake upstream               |
| IA-08 | Exercise built output, not a dev server or mocked shared libraries         |

PB-01a/PB-02a are predecessor checks for rad-components: find real imports, require public entries and reject cross-package `src`/`private` access. An empty scan cannot pass. PB-01-PB-03/PB-05 become shared-package checks in Phase 4. Apply IA requirements to both frontend entries; FS-07 adds native metadata/declarations/discovery.

#### Frontend migration: FS-01-FS-16

| ID    | Requirement                                                                                                                                                                                                               | Phase |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| FS-01 | Native default export has plugin ID `radius`, unique reviewed extensions for eight pages; removing one fails its installed journey                                                                                        | 3A    |
| FS-02 | Native `radius-api` constructs the real API with host Kubernetes dependency; GET reaches fake transport and removing API extension fails lookup. Cover graph POST through its current path until common-client extraction | 3A    |
| FS-03 | Preserve route parameters, external bindings, standalone URLs, nested/non-root navigation, history and refresh                                                                                                            | 3A    |
| FS-04 | Preserve `radius-catalog` ID and toggle behavior; optional home cards render, and absent cards do not break pages                                                                                                         | 3A    |
| FS-05 | Entries reuse product pages/API; native Radius has no plugin converter, copied renderer/domain logic or private imports                                                                                                   | 3A    |
| FS-06 | Native pages honor host API override, including connection selection/failures; no hidden default bypass                                                                                                                   | 3A    |
| FS-07 | Packed root/native entries and declarations resolve; export maps point to shipped files; explicit features or supported discovery install exactly one plugin/API/page set                                                 | 3A    |
| FS-08 | Same real-renderer journeys pass in legacy/native external fixtures using one candidate tarball and actual plugin registration                                                                                            | 3A    |
| FS-09 | Hybrid actual entry renders `app.createRoot()` and preserves alerts, dialogs, sign-in and themes                                                                                                                          | 3B    |
| FS-10 | App conversion and native Radius do not duplicate routes, factories, sidebar or flags                                                                                                                                     | 3B    |
| FS-11 | Pinned home, catalog/entity, catalog graph, settings and Kubernetes integration work; each temporary adapter has owner, upstream reference, explicit page/card mapping and removal condition                              | 3B    |
| FS-12 | Host auth distinguishes unauthenticated/forbidden; both themes work; external installs do not enable automatic guest sign-in                                                                                              | 3B    |
| FS-13 | Built standalone runs required journeys without required legacy app helpers/third-party converters; pair source scan with native runtime evidence                                                                         | 3C    |
| FS-14 | Removing old routes/imports preserves home cards, links, flags, theme selection, API overrides and refresh                                                                                                                | 3C    |
| FS-15 | Open-source Backstage installs/builds pass; host enforces authorization for resource GET and graph POST                                                                                                                   | 3C    |
| FS-16 | Record prior qualified app/lockfile/image and candidate frontend/backend tuple; actually restore the prior tuple and pass its journeys. Test legacy entry until approved retirement                                       | 3C    |

Use supported native frontend test utilities, not legacy mocks bypassing extension installation.

#### Native backend regression: BS-01-BS-04

Controlled services/identities qualify the host; Phase 8 adds real supported Radius/auth installations.

| ID    | Requirement                                                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| BS-01 | Real `createBackend` initializes app, proxy, auth/provider, catalog and Kubernetes plugins; import mocks are insufficient                   |
| BS-02 | Missing required services or failed plugin initialization fail startup explicitly; no silent skip or health-only substitute                 |
| BS-03 | Allowed requests reach selected Kubernetes GET/graph POST; unauthenticated/forbidden requests are rejected without cross-connection leakage |
| BS-04 | Required journeys and discovery/API lookup work without the health-only Radius scaffold                                                     |

#### React and consumer pin

| ID    | Requirement                                                              |
| ----- | ------------------------------------------------------------------------ |
| RX-01 | Dashboard resolves one React 18 copy after plugin installation           |
| RX-02 | Dashboard graph journeys pass on shared graph-react with React 18        |
| RX-03 | Isolated React 19 library success is not host qualification              |
| CP-01 | Pin immutable consumer commit, lock digest, toolchain and host matrix    |
| CP-02 | Clean isolated checkout builds and passes its journeys                   |
| CP-03 | Shared-library CI invokes dashboard-owned journeys without copying tests |
| CP-04 | New consumer pin passes the same gate before adoption                    |
| CP-05 | Scheduled check fails a pin older than the agreed window                 |

#### Components: per-file prefixes

One case per shipped page/tab/table/card must cover loading, empty, populated and error states, heading names and primary controls. Prefixes avoid shifting every ID when a suite grows; do not reuse an assigned prefix. EV avoids the cross-cutting ER prefix.

| Prefix | Source under test                                     | Recorded cases                    |
| ------ | ----------------------------------------------------- | --------------------------------- |
| RE     | `components/recipes/RecipeListPage.tsx`               | RE-01-RE-08                       |
| RK     | `components/recipes/RecipeTable.tsx`                  | RK-01-RK-10                       |
| RL     | `components/resources/ResourceListPage.tsx`           | RL-01-RL-07                       |
| RT     | `components/resourcetypes/ResourceTypeDetailPage.tsx` | RT-01-RT-30                       |
| AC     | `components/applications/ApplicationListInfoCard.tsx` | AC-01-AC-08                       |
| EC     | `components/environments/EnvironmentListInfoCard.tsx` | EC-01-EC-08                       |
| EV     | `components/environments/EnvironmentResourcesTab.tsx` | EV-01-EV-03                       |
| OT     | `components/resources/OverviewTab.tsx`                | OT-01-OT-07                       |
| DT     | `components/resources/DetailsTab.tsx`                 | DT-01-DT-03                       |
| AR     | `components/resources/ApplicationResourcesTab.tsx`    | AR-01-AR-03                       |
| LY     | `components/resources/ResourceLayout.tsx`             | LY-01-LY-04                       |
| RS     | `resources/resource.ts`                               | RS-01-RS-14, compile-time         |
| RO     | `routes.ts`                                           | RO-01-RO-07                       |
| FF     | `features.ts`                                         | FF-01-FF-05, with FF-02 withdrawn |
| RR     | App `components/Root/Root.tsx`                        | RR-01-RR-06                       |
| HP     | App `components/home/HomePage.tsx`                    | HP-01-HP-07                       |
| LC     | App `components/home/LearnCard.tsx`                   | LC-01-LC-07                       |
| CC     | App `components/home/CommunityCard.tsx`               | CC-01-CC-07                       |
| SC     | App `components/home/SupportCard.tsx`                 | SC-01-SC-06                       |
| AP     | App `apis.ts`                                         | AP-01-AP-04                       |
| BK     | Backend `src/index.ts`                                | BK-01-BK-06                       |

RU covers domain behavior; RS types emit no JavaScript and require exact-type/optional-key assertions that fail `yarn tsc`. Unrelated type errors cannot satisfy them. CU-00 and the original CU-01-CU-26 block are historical group labels, replaced by these per-file prefixes, not additional acceptance cases.

#### Plugin contract and coverage policy

The recorded Phase 3 baseline implements PU-01-PU-28 and PU-31-PU-35 through contract, artifact and policy suites, except withdrawn policy assertions. PU-29 is Phase 4 forwarding; PU-30 is release qualification.

| ID     | Requirement                                                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| PU-01  | Plugin registration ID is `radius`                                                                                                        |
| PU-02  | Public exports match Appendix A exactly                                                                                                   |
| PU-03  | Route refs have declared IDs                                                                                                              |
| PU-04  | Route refs declare required caller parameters                                                                                             |
| PU-05  | Root route ref is in plugin route map                                                                                                     |
| PU-06  | API ref ID is `radius-api`                                                                                                                |
| PU-07  | Exactly one factory binds that API ref                                                                                                    |
| PU-07a | Invoke the real factory with fake Kubernetes API and assert its actual request                                                            |
| PU-08  | Feature flag set is exactly `radius-catalog`                                                                                              |
| PU-09  | All routable pages are named extensions                                                                                                   |
| PU-10  | Public entry exposes API ref and `RadiusApi` type                                                                                         |
| PP-01  | Artifact suite has a separate serial script and CI step, outside repository Jest                                                          |
| PU-11  | Manifest declares `backstage.role: frontend-plugin`                                                                                       |
| PU-12  | `files` is `dist` only; `publishConfig` uses built entries                                                                                |
| PU-13  | `sideEffects: false` supports tree-shaking                                                                                                |
| PU-14  | React/DOM/router are peers, not dependencies                                                                                              |
| PU-15  | React peer range covers the host's React 18                                                                                               |
| PU-16  | Withdrawn: private/public setting belongs to design D5                                                                                    |
| PU-17  | Source declares graph workspace dependency; this alone proves no installability                                                           |
| PU-18  | Withdrawn: license conflict belongs to design D5                                                                                          |
| PU-19  | Pin current `@internal/plugin-radius` identity pending approved rename                                                                    |
| PU-20  | Root config enforces floors in repository runs                                                                                            |
| PU-21  | No ignored workspace-level floor                                                                                                          |
| PU-22  | No `global` coverage group                                                                                                                |
| PU-23  | Every workspace has exact full-source group or recorded exemption                                                                         |
| PU-24  | Every group points at an existing workspace source directory, not a narrower path                                                         |
| PU-25  | Require statements/lines; all declared floors finite and in (0,100]                                                                       |
| PU-26  | Built runtime named exports match source                                                                                                  |
| PU-27  | Emitted declarations compile in isolated packed consumer                                                                                  |
| PU-27a | Resolution points at extracted candidates, not workspace source                                                                           |
| PU-27b | Success/failure cleanup restores both source manifests byte-for-byte; source types still resolve to source                                |
| PU-27c | Packed identity/role/entries/files/sideEffects/peer placement/range rewrite and no shipped `src` pass; no private/license decision pinned |
| PU-28  | All eight real lazy extensions resolve through production host routes                                                                     |
| PU-29  | Retained rad-components forwards only; no domain/layout/renderer or independent React Flow/Dagre                                          |
| PU-30  | Final public manifest and approved license/notices pass before release                                                                    |
| PU-31  | Exemption list remains empty unless reviewed policy changes                                                                               |
| PU-32  | Narrowed groups leave an unguarded workspace and fail                                                                                     |
| PU-33  | Reject zero/negative/non-finite/>100 floors                                                                                               |
| PU-34  | Reject missing mandatory or zero optional floors                                                                                          |
| PU-35  | No workspace selects Sucrase's instrumentation-blind cache transform                                                                      |

Run artifact tests alone: `build`/`pack` rewrites source manifests, while other packaging tests read them. Use a private `os.tmpdir()` directory for tarballs/fixture and cleanup on failure. Store repository policy suites inside a workspace: a root probe produced "No tests found" with exit 0. A new policy workspace requires an explicit scan exclusion design, not an implicit exemption.

#### Backend scaffold maintenance: BE-01-BE-05

| ID    | Requirement                                                         |
| ----- | ------------------------------------------------------------------- |
| BE-01 | `GET /health` returns `{ status: 'ok' }`                            |
| BE-02 | Unknown path returns 404, never hangs                               |
| BE-03 | `createBackendPlugin` registers `radius` with declared dependencies |
| BE-04 | Init mounts on `httpRouter` and logs once                           |
| BE-05 | Router construction failure surfaces as startup failure             |

These are not initial plugin release gates.

#### Graph: GU-01-GU-25

The tier rules above distinguish desired invariants from linked baseline defect pins.

| ID     | Tier | Requirement                                                                            |
| ------ | ---- | -------------------------------------------------------------------------------------- |
| GU-01  | A    | Every resource yields one node; duplicate IDs have a separate pin                      |
| GU-02  | A    | Retained connections exactly match fixture-owned endpoint multisets                    |
| GU-02a | A    | Redirected, reversed, missing/extra edges and count-preserving duplicates fail         |
| GU-03  | A    | Every edge endpoint resolves in the same graph                                         |
| GU-04  | A    | Missing target is dropped/stubbed, not dangling; baseline defect pin                   |
| GU-05  | A    | Unparseable connection does not drop its owning node                                   |
| GU-05a | A    | Skip unparseable connections; baseline dangling-edge pin                               |
| GU-05b | A    | Do not mutate caller graph; baseline mutation pin                                      |
| GU-06  | A    | No duplicate node or self-loop for self-reference; baseline pin                        |
| GU-06a | A    | Characterize self-loop/duplicate-ID validation defect independently                    |
| GU-07  | A    | Same fixture yields same model and rendered remount result                             |
| GU-08  | A    | A then B equals B alone, in both orderings; positive #355 regression                   |
| GU-09  | A    | Positions finite; node bounding boxes do not overlap                                   |
| GU-10  | A    | Identities and relationships survive layout/rendering                                  |
| GU-11  | A    | Remount produces same record and leaks no timers                                       |
| GU-12  | B    | Find node by resource-name accessible label                                            |
| GU-13  | B    | Render relationship between named resources                                            |
| GU-14  | B    | Zoom/fit/controls work with mouse and keyboard                                         |
| GU-15  | B    | Empty graph has accessible empty state; baseline blank-state pin                       |
| GU-16  | B    | Request failure is retryable error, not empty success; baseline pin                    |
| GU-17  | B    | Layout failure is explicitly degraded but usable, not overlap; baseline pin            |
| GU-18  | B    | Node selection opens details and restores focus on close; baseline missing-feature pin |
| GU-19  | B    | Both themes work with real shared CSS                                                  |
| GU-20  | B    | Renderer or stylesheet removal fails GU-12/GU-13/GU-19                                 |
| GU-21  | C    | Every Appendix E fixture produces its committed record                                 |
| GU-21b | C    | Icon/status semantics use `not-yet-populated` when never supplied                      |
| GU-21c | C    | No coordinates in records                                                              |
| GU-22  | C    | Every generated/committed record difference has a manifest entry                       |
| GU-23  | C    | Report a carried defect while its own invariant is violated                            |
| GU-23a | C    | An unrelated repair cannot clear a defect                                              |
| GU-23b | C    | Each predicate detects violating and healthy records                                   |
| GU-23c | C    | Reject a known defect whose fixture has no record                                      |
| GU-24  | C    | Manifest empty at extraction-phase boundaries                                          |
| GU-25  | C    | Committed/base-branch differences require manifest entry                               |
| GU-25a | C    | Mutating a committed record reports an unapproved change                               |

GU-17 injects Dagre failure at the real component boundary under Jest; do not add a product-only browser fault hook. GU-20 must reject both a renderer stub and missing stylesheet; `ApplicationTab.test.tsx`'s graph double cannot satisfy it.

#### Host integration: HU-01-HU-12

| ID    | Requirement                                                                 |
| ----- | --------------------------------------------------------------------------- |
| HU-01 | Real host mounts plugin without error                                       |
| HU-02 | Each of eight routes shows its heading                                      |
| HU-03 | External bindings resolve to real route refs                                |
| HU-04 | Sidebar entries have accessible names                                       |
| HU-05 | Navigation uses refs, not hard-coded root paths                             |
| HU-06 | Nested plugin mount works                                                   |
| HU-07 | Non-root app base path works                                                |
| HU-08 | Both approved frontend entries mount                                        |
| HU-09 | External fixture uses host-owned auth                                       |
| HU-10 | Forbidden response shows access error, not empty list                       |
| HU-11 | Hosts reuse one journey implementation with host-specific setup             |
| HU-12 | Native backend/proxy serves Radius without the health scaffold; BS-01-BS-04 |

#### Namespace migration: NS-01-NS-10

The design owns the [assessed type mapping and payload differences](./2026-09-radius-backstage-plugin.md#appendix-c-resource-type-model-changes). Recheck them when implementing; no global string replacement or invented legacy-removal deadline.

| ID    | Requirement                                                                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NS-01 | Every fixture/test states its namespace and reason                                                                                                      |
| NS-02 | Appendix E gains current-type counterparts; retain mixed fixture                                                                                        |
| NS-03 | Correct sample's singular `Applications.Core/container` versus plural ID and migrate its shape                                                          |
| NS-04 | Replace hard-coded container order/gateway direction assumptions with namespace-aware behavior; verify whether new graph API needs direction workaround |
| NS-05 | Extend/replace application/environment-only equivalence; identify deliberate non-equivalents                                                            |
| NS-06 | Parser accepts digits, global IDs and existing legal-name cases                                                                                         |
| NS-07 | Carry graph edge kind and exercise a `Dependency`                                                                                                       |
| NS-08 | Separate legacy/current environment shapes                                                                                                              |
| NS-09 | Include user-defined type outside `Radius.`                                                                                                             |
| NS-10 | Keep Dapr on legacy types with reason                                                                                                                   |

Use a separate Tier C change after Phase 4's diff, unless D6 approves different timing. Clear the reviewed manifest after migration. No unexplained legacy assertions may remain outside Dapr.

### Appendix C: browser workflows

E2E-01-E2E-20 cover home; sidebar to all pages; application/environment/resource list-to-detail; all detail tabs; nested breadcrumbs; resource-type version selection; aggregated recipes; real named graph nodes/edges; details and focus restoration; mouse/keyboard zoom/fit; graph/resource direct refresh; connection switch in flight; partial failure/retry; list-page proxy errors; flag toggling; sidebar/list keyboard traversal; axe per page/theme; both application namespaces; and the same journeys in nested external mounting.

Scheduled reliability checks add empty/partial data, slow responses, repeated navigation and simultaneous graphs. Provide an accessible resource-information view that does not require reading the graph.

HOST-01-HOST-08 qualify installation/discovery, configured connections, proxy reachability and page load, unavailable control plane, forbidden access and cleanup in real disposable installations. Distinguish harness failure from product failure; simulation and skips are not release evidence.

### Appendix D: visual baselines

Human-review Storybook captures for multi-tier graph in both themes, single/empty graph, every deploy status, populated/empty resource table, environment overview, resource-type detail and home. Rebaseline only with a stated product reason.

### Appendix E: graph fixtures and records

Before extraction, fixtures are in `packages/rad-components/src/__fixtures__/graph/`; records are in `src/__fixtures__/graph-records/`. The empty manifest is `src/__fixtures__/graph-expected-changes.md`. Move ownership with graph journeys during extraction.

Fixtures: `empty.json`, `single-node.json`, `container-to-database.json`, `gateway-inbound.json`, `multi-tier.json`, `unparseable-connection.json`, `missing-target.json`, `self-reference.json`, `managed-cluster.json`, `deploy-status-matrix.json`, `unknown-type.json`, `duplicate-ids.json`, `both-namespaces.json`, `large-fan-out.json`.

`graphRecord.ts` is the one semantic normalizer. Sort node ID, label, type, icon identity, badge kind and accessible name; sort resolved edge source/target/direction. Omit coordinates, colors, classes, nesting and transforms. Layout properties belong to GU-08/GU-09, not coordinate snapshots.

Use `not-yet-populated` for missing renderer icon/status support. `null` could mean deliberate removal and cannot identify #35/#89. Each known defect has an `isPresent` predicate for its own invariant; test healthy/violating records so constant predicates cannot pass. A populated icon must not clear a duplicate-ID defect.

GU-22 compares generated versus committed records. GU-25 also compares committed records to `GRAPH_RECORD_BASE_REF`, then `origin/main`, and fails if neither is reachable. Checkout full history. A newly added fixture absent at base needs no baseline-change entry; it still needs reviewed requirements and fixture expectations.

Every changed field needs a manifest entry with fixture, field, old/new values, reason and linked issue where applicable. Review the manifest, not snapshot churn. Reject undeclared edits even when implementation and committed records changed together. Report unchanged defect invariants, then empty the manifest after the phase. Never use it as a permanent allowlist.

The legacy corpus deliberately reaches `Applications.Core/containers` layout and `Applications.Core/gateways` edge-direction branches (#373). Current-type fixtures alone would skip them. Perform NS migration separately so baseline preservation cannot hide a type-model change.

### Appendix F: source coverage and assertion pitfalls

Phase 1 closed the 24 substantive gaps among 40 of 71 source files without colocated tests; the other 16 were barrels. Component prefixes identify the closed files. App `index.tsx` remains a real-DOM/config bootstrap covered by host journeys, not a unit test. Graph/sample data are exercised by fixtures/invariants. `setupTests.ts` is infrastructure.

Barrels are covered through imports: app Root; rad-components root/components/appgraph/resourcenode; plugin root/api/resources and six component indexes; backend-plugin root. Phase 0 deleted the unused plugin parser copy: eleven consumers and its own adjacent test already used rad-components. RU-01/RU-02 moved beside that implementation.

| Pitfall                                                     | Required assertion                                                                                                                                                |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Error panel repeats message in heading/detail               | Assert all relevant matches, not a unique text query                                                                                                              |
| `LinkButton` is an anchor with `role="button"`              | Query its actual role and href                                                                                                                                    |
| Parent name also occurs in breadcrumbs/membership column    | Check Name column; give parent matching membership to exercise self-ID filter                                                                                     |
| `$ref`, arrays, maps, definitions and repeated schema names | Pin last-segment refs, `T[]`/`Ref[]`/bare array, map/object, required/read-only directions, `Schema` case fallback, recursive definitions and descending versions |
| Repeated property name across API version/parent path       | RT-30 must preserve each occurrence, not name-key overwrite                                                                                                       |
| Resource-type navigation                                    | RT-28/RT-29 use real route params and request-sensitive stubs; verify refetch                                                                                     |
| Recipes require asynchronous pack fan-out                   | RE covers unreachable packs via `allSettled`, shared-pack de-duplication and environment selection; RK covers per-type rows/name-to-source mapping                |
| Resource list has no type context                           | Assert Type/Application/Environment/Status columns                                                                                                                |
| External card names have hidden new-window suffix           | Match intended accessible-name prefix and destination                                                                                                             |
| Types-only source                                           | Exact-type/optional-key assertions, not render coverage or unrelated compiler errors                                                                              |

Backend entry tests use the documented SWC override to lower six native `import()` calls to `require`; otherwise Jest CJS rejects them without VM modules. They verify modules, install order and start-after-add, not production ESM loading. Do not select Sucrase: its upstream cache ignores `instrument`, so reusing a non-coverage compile can report 0% with passing tests (#366).

### Appendix G: coverage policy

Root `package.json` owns exact full-source path groups. Repository Jest projects ignore per-workspace `coverageThreshold` with a warning. A grouped file leaves `global`; with all source grouped, `global` measures nothing and can fail at 0%. Do not add it.

Require `./<workspace>/src/` groups, mandatory statements/lines and finite positive optional floors. The exemption list is empty. Shape guards PU-20-PU-25/PU-31-PU-35 reject narrowed paths, absent workspaces and invalid percentages. They do **not** prevent a positive historical decrease; Phase 6 adds comparison to the base revision. Until then, review rejects unjustified decreases.

| Workspace                       | Statements | Branches | Functions | Lines |
| ------------------------------- | ---------: | -------: | --------: | ----: |
| `plugins/plugin-radius`         |        73% |      55% |       68% |   74% |
| `plugins/plugin-radius-backend` |        93% |     100% |      100% |  100% |
| `packages/rad-components`       |        95% |      93% |       94% |   94% |
| `packages/app`                  |        93% |     100% |       83% |   92% |
| `packages/backend`              |       100% |     100% |      100% |  100% |

Floors are rounded down; a small regression inside that margin can pass. Raise a group's floor above its measured result in a negative test and verify the named failure.

Both backend branch floors are 100% over an empty counter set; the first uncovered branch must fail. App's measured branch floor covers one counter; `index.tsx` contributes 0/3 statements/lines and no branches. A new branch needs coverage or a reviewed boundary change, not a relaxed floor.

Root `/__docs__/` excludes Storybook examples, not shipped graph code. The old workspace glob `<rootDir>/**/__docs__/*` was not an effective regex. Preserve the root boundary and measured floor.

T1's proposed Phase 6 targets follow. Apply each only if it strengthens current enforcement; no 85%/95% backend or 80% app target may replace an existing 100%/higher floor.

| Workspace                       | Statements | Branches | Functions | Lines |
| ------------------------------- | ---------: | -------: | --------: | ----: |
| `plugins/plugin-radius`         |        90% |      80% |       90% |   90% |
| `plugins/plugin-radius-backend` |        95% |      85% |       95% |   95% |
| `packages/app`                  |        80% |      70% |       80% |   80% |

No new target for retired rad-components. Shared graph coverage moves under upstream floors; dashboard retains L5/L6 checks. Changed code must be meaningfully tested without lowering either repository's baseline.

For T3, five page suites exceeded Jest's 5000 ms under loaded parallel runs: EnvironmentListPage, ApplicationListPage, ResourceTypesListPage, ResourceTypeDetailPage and ResourcePage. Each passed alone. One run's seven timeouts produced 30.72% branches against 31%, hiding runner contention behind coverage failure. Compare `yarn test:all` with `yarn test:all --maxWorkers=2`; preserve the standard reduced-worker local coverage setting and CI's configured default. A clean default-worker rerun does not close #360.

### Appendix H: candidate CI protocol

This is the mandatory test procedure for shared-library changes, not a new publication workflow. Design D4 owns the policy; T4 must settle the exact invocation/job/pin-age contract.

1. Identify candidate revision/artifact digest, immutable dashboard integration revision and external fixture pin. Include lockfile digest, compiler/runtime, active host entries and adapter inventory. Refresh pins through reviewed old/new evidence, not by bypassing failures.
2. Build/pack the actual core and graph-react candidates. If testing only core, use a qualified graph-react version with its transitive core forcibly resolved to the candidate. A root dependency override alone is insufficient.
3. Install candidates into clean hosts through the dashboard-owned invocation seam. Use overrides/resolutions, never copied source/tests. Bootstrap probes may establish the seam, but each first extraction must run real impacted host journeys through its candidate before merge.
4. Report actual resolved artifact paths/digests, exact versions and direct/transitive core closure. Reject registry fallback, source aliases, workspace links, stale old renderers and mismatched identities.
5. Compile packed declarations under dashboard TS6 and the approved external compiler; build frontend/backend output and verify entry discovery, CSS provenance and a single React. Shared React 18/19 results stay separate from the React 18 host.
6. Serve production build/container output against controlled upstream data. Run impacted real graph and read/inspect journeys, nested navigation, API overrides, auth/failure handling and active frontend rows. A missing candidate/stylesheet must fail, not exercise fallback code.
7. Tie completion to the candidate and consumer revisions. Fail closed on missing, stale, skipped, pending, cancelled, failed or mismatched evidence. Upload bounded redacted diagnostics; a dispatch receipt or successful package import is not qualification.
8. Execute candidate code as untrusted: isolated read-only environment, no npm/GHCR/cloud/signing secrets, no privileged runner or inherited host credentials. Retrieve private source/artifacts outside candidate execution and expose only needed read-only inputs. Keep protected publication in a separate trusted job.

Before package adoption, a reviewed integration revision may contain only the needed host edits. After adoption, use the integrated consumer pin and reject legacy fallback. Re-run gates after any artifact/range rewriting. The [design's release section](./2026-09-radius-backstage-plugin.md#appendix-d-delivery-and-release) owns publication order, version coherence and rollback; FS-16 owns the restoration proof.

### Appendix I: tracked defects and safe test data

`KNOWN-DEFECT` pins must change when their linked fix lands. Do not preserve a defect to keep the baseline green.

| Issue | Defect / owner of evidence                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------ |
| #35   | Missing resource-type icon identity: GU-21/GU-23                                                                               |
| #41   | Missing selectable dismissible resource details: GU-18                                                                         |
| #89   | Missing deployment status: GU-21/GU-23                                                                                         |
| #352  | Parser rejects legal names/types; card symptom includes scrollWidth error: RU-02, AC-08, EC-08                                 |
| #353  | Unresolved connection targets silently lost/dangling: GU-04/GU-05a                                                             |
| #354  | Model building mutates input: GU-05b                                                                                           |
| #355  | Fixed per-call Dagre state: GU-08 is now a positive regression                                                                 |
| #356  | Resource reads choose first cluster, graph POST last: CN-03/CN-04                                                              |
| #357  | Missing self-loop/duplicate-ID validation: GU-06a                                                                              |
| #358  | Publication identity/installability: PU-10/PU-17/PU-19/PU-26-PU-28 and design D5                                               |
| #359  | rad-components ISC versus Apache-2.0 metadata: design D5, not a permanent test assertion                                       |
| #360  | Loaded-machine page timeouts: T3; harness risk, not product pin                                                                |
| #361  | Missing type description gets placeholder container docs: RT-07                                                                |
| #362  | Off-route layout displays `undefined/undefined: undefined`: LY-04                                                              |
| #363  | Output tab hides read-only nested properties and shows writable ones: RT-27                                                    |
| #364  | Discord card `to=""` points home, lacks new-window hint: CC-05/CC-06                                                           |
| #365  | Required `systemData: Record<string, never>` forces fixture casts: RS-14; replace with optional open-valued model tests on fix |
| #366  | Sucrase cache key omits instrumentation: PU-35, upstream Jest module; zero current usage                                       |
| #367  | Implicit, unscoped, inconsistently cancellable connection: CN-02/CN-05-CN-08, ER-01/ER-02                                      |
| #368  | No graph empty/degraded-layout state: GU-15/GU-17                                                                              |
| #369  | Partial namespace failure shown as complete: ER-08                                                                             |
| #370  | Graph error has no retry action: GU-16                                                                                         |
| #373  | Hard-coded legacy graph types: NS corpus and separate migration                                                                |

Issues #361 and #363 share nearly duplicated 1100-line tab bodies in the 2693-line ResourceTypeDetailPage; retain that cause when fixing them. #352 needs visible-card regression coverage, not just parser cases. #356 needs the same two-cluster fixture on both paths before extraction.

Withdrawn PU-16, PU-18 and FF-02 asserted unresolved private/license/export-policy choices. Resolving a decision must not break CI; design D5 owns those choices.

Fixtures use small fixed placeholder data (`demo-app`, `demo-env`, `demo-group`), never customer values. Unit/component/contract tests read no kubeconfig, cluster credentials or control-plane endpoints. Declare Kubernetes mocks; fail unexpected requests. Local browser stubs bind `127.0.0.1` on OS-assigned ports. Serve fonts and renderer styles locally. Scrub traces/logs before upload.

### Appendix J: baseline evidence

This is the audit trail for Phases 0-3, not the current release matrix. The [pre-consolidation snapshot](https://github.com/radius-project/dashboard/blob/650c9a60217ae3bc73384db3e5e21c5c10cb8090/docs/design/2026-09-dashboard-plugin-test-plan.md) retains the full chronological notes; operative requirements live here.

| Checkpoint                      | Recorded result / limitation                                                                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1 first increment         | Plugin statements 61.22 to 69.19, functions 46.23 to 58.79, branches 33 to 46.74                                                                                     |
| Phase 1 closing increment       | Plugin statements 72.70; app 75/0/0/78.79 to 93.51/100/83.33/92.86; backend 0 to 100 and exemption removed; Radius scaffold 62.50/n/a/50/71.43 to 93.75/n/a/100/100  |
| Phase 1 default-worker recheck  | 53 suites / 427 cases, 38.257 seconds; no timeout increase; #360 stays open                                                                                          |
| Phase 2                         | 54 suites / 460 cases; Playwright 2 specs / 13 cases; fourteen committed graph records and empty manifest                                                            |
| Post-Phase 3 review             | 56 suites / 476 cases; plugin statements 73.89%, rad-components 95.89%; two browser specs plus home smoke total fourteen cases (eight renderer, five host, one home) |
| Plugin floor sequence, S/B/F/L  | 61/33/46/60, 69/46/58/68, 70/50/61/70, 72/54/64/72, 73/55/67/73, 73/55/68/74                                                                                         |
| rad-components measured S/B/F/L | 95.08/93.75/94.59/94.59 after records, failure and accessibility checks                                                                                              |
| Backend scaffold floor sequence | 62/n/a/50/71 to 93/n/a/100/100, later empty-set branch floor 100                                                                                                     |
| Namespace research snapshot     | `Applications.` in 40 files, 57 API test occurrences; `Radius.` in 15. ResourceTypesTable excludes `Applications.`/`Microsoft.` despite legacy test corpus           |

Phase 2 model tests use `buildGraphModel`; keep assertions when its adapter switches to shared code. `graphRecord.ts` owns normalization. Direct renderer journeys are `packages/rad-components/e2e-tests/appGraph.test.ts`; host list/detail/graph/error/timeout journeys are `packages/app/e2e-tests/radiusGraph.test.ts`. Both use actual styles/rendering; host proxies are deterministic. Initial graph tests against doubles were not evidence of graph behavior.

GU-08 originally needed module isolation to reveal leaked Dagre state. After the maintainer-requested #355 fix it compares sequential/standalone layouts in both orders; isolation was removed. Other characterized defects remain linked, not blessed.

Phase 3 added public API exports and executable factory checks, real lazy-route journeys, source/dist parity, isolated packed declarations and manifest restoration. Its local artifact proof is narrower than clean package-manager host installation, transitive shared dependency/CSS qualification or public release approval.
