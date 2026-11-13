# Building the Radius Dashboard

## Prerequisites

- Install a modern version of [Node.js](https://nodejs.org/en/download). We use v24.X.X but other versions >= 22 are ok.
- Install [Yarn](https://yarnpkg.com/getting-started/install) or enable corepack with `corepack enable`.

You'll also want an [environment](https://docs.radapp.io/guides/deploy-apps/environments/overview/) where you can experiment with Radius. This means you need to have a Kubernetes cluster where Radius is installed. The Dashboard interacts with the Radius API to access the data it displays.

For development, we recommend VS Code. This repo is configured with recommended extensions that can automate parts of the development process when installed.

## Troubleshooting

The most common problem with building and developing in the repo is having the wrong version of Node.JS. Check your version with:

```bash
node --version
```

Check your yarn version with:

```bash
yarn --version
```

This should match the version specified in `package.json` in the `packageManager` field.

## Common commands

You will need these commands to successfully develop the Dashboard and contribute core to the repository.

**Install dependencies:**

```bash
yarn install
```

---

**Running the Dashboard locally:**

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

---

**Compile TypeScript:**

```bash
yarn run tsc
```

If you make changes to multiple packages at once, you may need to may need to manually run the TypeScript compiler.

---

**Run tests:**

```bash
yarn run test:all
```

If you have the Jest extension installed in VS Code the tests will run every time you make a file change.

---

This project is configured to use `prettier` for code formatting. This is checked as part of the pull-request process.

**Run the formatter to automatically fix violations:**

```bash
yarn run format:write
```

---

This project is configured to use `eslint` for linting, along with recommended rules for React and TypeScript. This is checked as part of the pull-request process.

**Run the linter:**

```bash
yarn run lint:all
```

## Complete command reference

This is a more complete command reference for what our packages support. You will likely only need these commands in specialized cases.

### Building the code

**Build all packages:**

```bash
yarn run build:all
```

**Build a specific package**

```bash
# Substitute rad-components with any package name
yarn workspace @radapp.io/rad-components run build
```

#### Shared-library candidate preflight

Use compiled core and graph-react tarballs from one identified producer revision.
Do not use source aliases, registry fallback, or a rebuilt archive with an old digest.
Use a temporary receipt outside the repository for intermediate candidates.
For persistent development adoption, save the final compiled pair and its
source/build/digest/license receipt under `vendor/shared-libraries`; use only
repository-relative file resolutions. Do not commit intermediate candidates.
This development path does not qualify registry or public package distribution.
The byte-verification fields have this shape. Paths are relative to the receipt:

```json
{
  "sourceRevision": "<full 40-character producer commit>",
  "core": {
    "path": "radius-project-core-0.1.0.tgz",
    "sha256": "<archive SHA-256>"
  },
  "graphReact": {
    "path": "radius-project-graph-react-0.1.0.tgz",
    "sha256": "<archive SHA-256>",
    "stylesSha256": "<dist/styles.css SHA-256 from this archive>",
    "baseSha256": "<dist/base.css SHA-256 from this archive>"
  }
}
```

Run `yarn verify:shared-candidate <receipt.json>` before installation. It checks
archive identity, shipped public JavaScript and declarations, stylesheet bytes,
the exact graph-to-core dependency, and React peer declarations. This command
does not download packages, extract files, run package code, or change manifests.

After an explicit candidate installation, run
`yarn verify:shared-candidate <receipt.json> <consumer-directory>`.
This also compares all installed package files with the pinned archives, rejects
workspace package links, and checks that direct and graph-transitive core and React
resolve to the same files. React checks include each declared runtime renderer
dependency, including `@xyflow/react`. When compatibility entries are present,
both public compatibility entries must resolve the same core and React/DOM files.
The installed consumer must also provide the optional Flow11 peer: its renderer
must use the host React/DOM files and the same Flow11 provider instance as the
legacy ResourceNode entry. Archive checks reject a required or direct Flow11
dependency in place of that isolated optional peer. These checks do not prove
that a native browser bundle excludes Flow11; host qualification must prove that.
No package version alone proves artifact identity.

Both stages report `hostQualified: false`. They do not prove browser safety,
compatibility, CSS loading, or host behavior, and do not approve publication.
Producer evidence must bind the declared source revision to the archive digests;
the preflight does not verify that source relationship.
Phase 4 still requires candidate-backed root/native host journeys, browser
renderer/CSS negative checks, and reviewed graph record differences against the base.
Run the preflight regression tests with `yarn test:qualification-runners`.

#### Installed external frontend evidence

Run `yarn test:e2e:installed` with `QUALIFICATION_EVIDENCE_DIRECTORY` set to an
absolute, persistent directory outside the checkout. Do not use `/tmp` for this
directory. The runner retains candidate archives, the clean consumer manifest
and lockfile, the exact tested tuple, build metadata, browser records, and each
command's log and result. A failed command retains its evidence and exits with
an error. Each run creates a new consumer; it does not reuse an old install.
The first install explicitly creates that consumer's lockfile, including in CI.
A second install uses `--immutable` to verify it. Repository installs remain
immutable.

For WSL or another system with a slow mounted drive, set
`QUALIFICATION_WORK_DIRECTORY` to an absolute, native-filesystem directory
outside the checkout. The runner creates a fresh consumer there. It retains
logs in the evidence directory and copies archives, fixture sources, lockfiles,
builds, and results there, but not `node_modules`.

The runner builds and packs the plugin and forwarding package. It installs those
tarballs and the pinned shared pair with Yarn, without repository dependency
links. It compiles the installed public declarations and both host fixtures.
It then extends the Phase 3/4 production browser runner with an isolated-input
check, nested plugin mounts, a separate app base path, route-ref navigation,
external bindings, host-owned fixture identity, and visible HTTP denial.
The same graph observer checks real cards and rejects missing CSS and a stub
renderer. The repository and installed lockfile hashes identify the tested
tuple; this command does not establish a Backstage or compiler support range.

By default, this is **external frontend evidence, not full Phase 5
qualification**. Its HTTP fixture implements the Kubernetes API boundary.
It is not a real Backstage backend or a Radius control plane.

After building the dashboard container below, set
`QUALIFICATION_CONTAINER_IMAGE=ghcr.io/radius-project/dashboard:edge` when
running `yarn test:e2e:installed`. This repeats the same clean installed
legacy/native browser journeys through the actual container backend and
Kubernetes proxy to the declared fake upstream. It checks allowed GET/graph POST,
visible upstream denial, missing authentication, and explicit startup failure
with missing Kubernetes initialization config. The test host uses a controlled
static token restricted to the Kubernetes plugin, not a production provider.
Container evidence includes exact image identity, config, startup logs, and
upstream request results. Docker uses `--pull=never`; no image is published.
This mode requires Linux Docker host networking (`--network host`). Docker
Desktop on Windows and macOS does not support it. Run it on a Linux host or in
WSL with a native Docker engine.

`QUALIFICATION_CONTAINER_IMAGE` names a locally built image. The `:edge` tag is
only the local build tag. The runner never pulls or publishes this image.

To run the existing four native-host baseline tests against the built image:

```bash
QUALIFICATION_CONTAINER_IMAGE=ghcr.io/radius-project/dashboard:edge \
QUALIFICATION_EVIDENCE_DIRECTORY=/absolute/persistent/evidence \
yarn test:e2e:standalone nativeHost.test.ts
```

Without `QUALIFICATION_CONTAINER_IMAGE`, `test:e2e:standalone` retains its real
repository-backend setup. Both modes reuse `testBackendConfig` and the existing
test implementation. The container mounts only the generated config, not source
or dependencies. These baseline tests do not cover the full eight-route,
nested-mount, base-path, and graph matrix in the container frontend.

#### Full installed-host matrix

To qualify all active hosts, enable the full matrix and the container row:

```bash
QUALIFICATION_FULL_HOST_MATRIX=true \
QUALIFICATION_CONTAINER_IMAGE=ghcr.io/radius-project/dashboard:edge \
QUALIFICATION_EVIDENCE_DIRECTORY=/absolute/persistent/evidence \
QUALIFICATION_WORK_DIRECTORY=/absolute/native/work \
QUALIFICATION_SOURCE_REVISION="$(git rev-parse HEAD)" \
yarn test:e2e:installed
```

This mode builds the actual app and backend in the clean installed consumer.
It runs the native standalone and container baseline tests, then the shared
eight-route, nested-plugin-mount, root and `/nested` app-base, and graph journeys.
It also checks backend service requirements and two-connection authorization
and credential isolation against the declared fake upstream.

In full-matrix mode, the image setting enables the container row. The runner
builds a new local `radius-phase5-installed:<plugin-digest>` image from the clean
consumer; it does not use the supplied image as the candidate. No image is
published. Docker and Linux host networking are required.

A successful full-matrix run with the container writes `phase5Complete: true`
and an empty `openGates` list. Without full-matrix mode or the container row,
the result has `phase5Complete: false` and lists the open gates.
See the [requirement map](../../../../plugins/plugin-radius/README.md#phase-5-installed-host-evidence)
for the executable checks and evidence limits. The shared candidate preflight
still reports `hostQualified: false`.

#### Phase 6 CI gates and remaining policy decisions

The existing required **Build Packages** job runs the contract, native frontend,
backend and graph-record suites. Coverage results are advisory and do not block
a pull request merge. The job still collects coverage, but its test command
overrides Jest's thresholds with `--coverageThreshold='{}'`. Actual test failures
still block the job. The root coverage floors remain unchanged for local use.
The job also runs the package artifacts,
standalone browser, component browser and full clean installed-host matrix on
pull requests and release tags. The installed matrix uses the Phase 5 runner
above; it does not copy host tests or use a running deployment. Its container
is built from the new clean consumer. The job has a 60-minute limit.
Component checks use the installed lockfile's Chromium, not system Chrome.
Component and standalone qualification do not retry failed tests.

Before tests, `node scripts/ci-policy.ts coverage <base-commit>` compares root
coverage floors and exclusions with an immutable Git revision. Pull requests
use their actual base SHA. Main pushes use the previous SHA; release tags use
the tagged commit's parent. Missing history, removed/narrowed groups, missing
metrics, a decrease in any existing floor, and changed exclusions produce an
advisory step failure, not a merge block.
The existing policy tests still require a full-source group for each workspace.
No proposed T1 target replaces a stronger current floor.
Both policies must have nonempty full-source workspace groups. New groups and
metrics are also checked; narrowed paths and invalid percentages are rejected.
The same job installs and builds the immutable base in a separate clean checkout,
then runs the same coverage command with threshold enforcement disabled.
An exit trap removes that checkout, its build files and its Git worktree
registration on success or failure, before downstream qualification starts.
It compares all four measured counters in each existing full-source group with
the candidate's JSON summary. Any decrease produces an advisory step failure,
including a change smaller than the rounded floor margin. Missing groups,
invalid counters and unavailable reports also produce advisory failures.
Empty counter sets count as 100%, so the first uncovered branch is reported.
The policy comparison, measured comparison and Codecov upload all use
`continue-on-error: true`; none can fail the required job. Policy helper regression
tests remain required. Team approval of T1 targets remains open.

Failure uploads contain only validated revision/run identifiers and fixed stage
outcomes, at most 1 KiB, retained for one day. They contain no raw logs,
request bodies, configuration, tokens, resource names, screenshots or traces.
Unset or empty stage outcomes are recorded as `skipped`; invalid text is rejected.
Detailed host evidence stays on the disposable runner and is not uploaded.
Cancelled runners may stop before evidence upload; missing evidence is not a pass.
Use `yarn test:ci-policy` for the positive and negative policy regressions.

**Consumer protocol status: not enabled for adoption.** The checked-in
`.github/consumer-policy.json` has `status: pending`. The daily
**Consumer pin freshness** workflow fails explicitly until T4 has an approval
record, exact trusted producer/coordinator/consumer workflow revisions, an exact
toolchain, required job names, a host matrix and a positive age window.
There is deliberately no invented approved owner, window or initial consumer pin.
This scheduled workflow does not make the external producer gate required.

The pin identifies the exact dashboard version used to test changes to
`@radius-project/core` and `@radius-project/graph-react`, including its lockfile,
toolchain and host matrix. Freshness limits how old that dashboard test version
can become before a reviewed refresh is needed. It is not a plugin publication
pin, and the producer connection is not yet implemented.

`yarn verify:consumer <trusted-policy.json> <proposed-pin.json>` is a
service-record preflight for that future protected coordinator. It reads no
candidate success report. It independently reads GitHub to check:

- The immutable consumer commit, its age, lockfile SHA-256, runtime constraint,
  exact approved Node/Yarn/compiler/React tuple, and locked compiler/React pair.
- The producer repository, head repository, workflow path, run ID and candidate
  revision; completed successful status; and matching producer workflow bytes
  at the trusted revision and tested revision.
- Invocation of both immutable coordinator and dashboard-owned consumer workflows.
  Every approved job must appear exactly once and succeed in the latest run attempt.
- The artifact's service-assigned ID, run, revision, tuple name, digest and
  unexpired status; its creation time must fall in the latest successful attempt.
  Missing, stale, pending, skipped, cancelled, failed or mismatched
  records fail. Job pagination is bounded and fails if incomplete.

An approved policy has `approval: {owner, date, reference}`, `maxPinAgeDays`,
`producer: {repository, path, revision}`, `coordinator: {path, revision}`,
`consumer: {path, revision}`, `requiredJobs`, `hostMatrix` and
`toolchain: {node, packageManager, compiler, react}`. Workflow paths include the
repository, for example `radius-project/dashboard/.github/workflows/consumer.yml`.
Each revision is a full commit SHA. Toolchain versions are exact, not ranges.
The host matrix must contain exactly `legacy-external`, `native-external`,
`native-standalone` and `built-container`, without duplicates. Coordinator and
consumer workflow paths must differ.
A proposed pin has `revision`, `lockSha256`, `node`, `packageManager`, `compiler`,
`react`, `hostMatrix`, `candidateRevision`, `runId` and `artifactId`.
Its revision must equal the approved dashboard workflow revision.
The expected artifact name is
`dashboard-consumer-<consumer-revision>-<candidate-revision>`.

The preflight is **not CP-03 integration or complete CP-04 qualification**.
It does not download the artifact ZIP, prove its package contents, install a
candidate, run journeys, or establish that a workflow's job implements the
promised security boundary. Its service result must not authorize adoption by
itself. The protected coordinator must bind the downloaded artifact bytes to
GitHub's digest, check the package pair, install it through the existing
candidate seam, and run the same clean host gate before accepting a new pin.
Load policy and reporter code from a reviewed protected immutable revision,
not the candidate checkout or artifact. Run retrieval/reporting separately
from candidate execution. Candidate execution must have no signing, registry,
cloud or host credentials, inherited tokens, or privileged host access.

The producer invocation and protected coordinator are not configured by this
dashboard change. Before closing Phase 6, CI owners must approve T4 and its
refresh owner, implement and pin those workflows, test rejection paths through
the real producer, and verify its required status/ruleset. A recommended starting
proposal is a daily check with a seven-day pin age: it permits a weekly reviewed
refresh while bounding drift. This is a proposal, not an agreed policy.

On November 12, 2026, the live active main ruleset required **DCO**,
**Build Packages** and **Build and Publish Container**. The dashboard checks
above remain inside that existing required job; no required check is removed.
They become enforced only when this workflow change lands and passes in GitHub.
No ruleset edit, external required gate or public release qualification is
claimed here. Phases 7/8 and production-auth qualification remain separate.

**Build the dashboard container**

```bash
yarn install
yarn tsc
yarn build:backend
yarn build-image
```

The current `Dockerfile` is set up to build the container using state from the repo like the `node_modules/` folder. This is why the set of steps described above is required.

The `build-image` command uses `packages/backend/Dockerfile`. Its Docker build receives
`org.opencontainers.image.revision` from `git rev-parse --verify HEAD` (the actual checkout,
not `GITHUB_SHA`) and `org.opencontainers.image.version` from `REL_VERSION`, defaulting to
`edge` for local builds. A Git checkout is required to produce this provenance.

The Build workflow runs FS-16 on pull requests and `main`. Issue
[radius-project/dashboard#421](https://github.com/radius-project/dashboard/issues/421)
tracks removal of this automatic check and its pinned previous image. Remove them after the
first native-frontend release is published and a successful candidate-and-restore run is
recorded for that release's source revision. Keep the manual rollback runner and legacy
root-entry artifact tests until their retirement is approved separately.

#### Release image staging

The Build workflow stages release images under full-version tags. It does not publish
stable `X.Y` channel aliases during a tag build:

| Git ref | Version label | Published image tag |
| --- | --- | --- |
| `refs/tags/v0.60.0-rc.1` | `0.60.0-rc.1` | `0.60.0-rc.1` |
| `refs/tags/v0.60.0` | `0.60.0` | `0.60.0` |
| `refs/tags/v0.60.1` | `0.60.1` | `0.60.1` |
| `refs/heads/main` | `edge` | `edge` |
| Pull request | `pr-<number>` | Not published |

Radius's gated release finalizer promotes the stable `X.Y` aliases, and `latest` for
the newest stable release, with ORAS after release qualification. `latest` therefore
always names a stable release; `main` builds publish only `edge`. Staging a dashboard
image alone does not promote a release.
Full release versions must match the source `v` tag and be valid Docker tags; SemVer
build metadata containing `+` is rejected rather than silently rewritten.

Before building a release, `scripts/release-image.ts` resolves only the top-level
full-version tag with `docker buildx imagetools inspect --raw`; only that tag's
explicit not-found response permits a new build.
If it already exists, the helper pulls its immutable manifest digest, verifies both
provenance labels and the single `linux/amd64` platform, and reuses that image for
the existing container E2E tests and image analysis. Matching output is reused even
if a rebuild would have a different image ID. Well-formed `unknown/unknown` BuildKit
attestation descriptors in an index do not count as runnable platforms. Reuse
preserves the original index and its attestations without repushing it.
Missing labels, a conflicting revision
or version, other platform sets, malformed metadata, missing index members, or
registry query errors fail the job; they do not authorize overwriting an existing tag.

After validation, staging checks the registry again before pushing a missing
full-version tag and verifies the published metadata. Runs for the same release tag
are serialized without cancellation. Registry tags do not support a client-side
atomic create-only operation, so release-version writes must remain exclusive to
this workflow; the Radius finalizer writes channel aliases and `latest` instead. An existing
conflicting release requires investigation, not deletion or an automatic overwrite.
The independently published `main`/`edge` path is outside the release transaction.

After staging, the separate `Attest Release Image` job signs SLSA build provenance
for the full-version tag's digest with `actions/attest`. Only that job can request
the OIDC signing token, so build and test dependencies never receive it. Rerunning a
release build signs the same digest again, which is harmless. To verify a release:

```bash
gh attestation verify oci://ghcr.io/radius-project/dashboard:<version> \
  --repo radius-project/dashboard \
  --signer-workflow radius-project/dashboard/.github/workflows/build.yaml \
  --source-ref refs/tags/v<version>
```

### Formatting

This project is configured to use `prettier` for code formatting. This is checked as part of the pull-request process.

**Run the formatter to find violations:**

```bash
yarn run format:check
```

**Run the formatter to automatically fix violations:**

```bash
yarn run format:write
```

### Linting

This project is configured to use `eslint` for linting, along with recommended rules for React and TypeScript. This is checked as part of the pull-request process.

**Run the linter manually:**

```bash
yarn run lint:all
```

### Testing

#### Coverage reports

`yarn run test:all` runs the unit tests with coverage and checks the coverage
limits in the root `package.json`. Jest writes the reports to `coverage/`.
Open `coverage/lcov-report/index.html` to view the local report.

The Build workflow uploads `coverage/lcov.info` to
[Codecov](https://app.codecov.io/gh/radius-project/dashboard) after the unit tests
pass in `radius-project/dashboard`. Fork builds skip the upload, but pull requests
from forks to `radius-project/dashboard` still upload coverage. The workflow runs
these tests on pull requests, pushes to `main`, and release tags.
Reports from `main` provide the baseline for pull request comparisons. Upload
errors fail the build; the existing Jest coverage limits remain in place.

The [radius-project](https://app.codecov.io/gh/radius-project) Codecov organization
allows uploads without a token. Organization administrators manage this setting
under **Settings > Global Upload Token**. This supports public
repositories, fork pull requests, and Dependabot builds without shared secrets.
No `CODECOV_TOKEN` secret is required. The Codecov GitHub App is enabled for this
repository and provides pull request checks and comments.

**Run offline release image regressions:**

```bash
yarn run test:release-images
```

This suite is also part of `yarn run test:all`, which CI runs for pull requests,
pushes to `main`, and release tags. It requires Node.js 24, Git, and Python, but no
installed dependencies, Docker daemon, registry credentials, or network access.
To run without Yarn:

```bash
node --test scripts/release-image.test.ts
```

The tests use a temporary Git checkout, the actual release-version parser, and a
fake Docker command runner. They cover RC, final, patch, edge, provenance forwarding
through the real build script chain, immutable-tag reuse and conflicts, platform
validation, failure handling, and the absence of early channel publication.
Attestation-bearing indexes are covered for both reuse and post-push verification,
including rejection of malformed descriptors, extra runnable platforms, and
attestation-only indexes.

The native frontend qualification pins selected Backstage packages to a tested
version set. These exact versions define the qualification set; they are not a
public support range.

**Run E2E tests:**

```bash
yarn run test:e2e
```

### Scripts

**Run a specific script in a specific package**

```bash
# Substitute rad-components with any package name
# Substitute lint with any script name
yarn workspace @radapp.io/rad-components run lint
```
