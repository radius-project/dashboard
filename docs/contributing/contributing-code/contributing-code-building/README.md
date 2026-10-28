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

For a local build only, set `IMAGE_NPM_REGISTRY_SERVER` to use a different npm registry for
dependency installation. The value reaches Docker only as a BuildKit secret, and release
builds reject it.

#### Release image staging

The Build workflow stages release images under full-version tags. It does not publish
stable `X.Y` channel aliases during a tag build:

| Git ref | Version label | Published image tag |
| --- | --- | --- |
| `refs/tags/v0.60.0-rc.1` | `0.60.0-rc.1` | `0.60.0-rc.1` |
| `refs/tags/v0.60.0` | `0.60.0` | `0.60.0` |
| `refs/tags/v0.60.1` | `0.60.1` | `0.60.1` |
| `refs/heads/main` | `edge` | `latest` (unchanged) |
| Pull request | `pr-<number>` | Not published |

Radius's gated release finalizer promotes the stable `X.Y` aliases with ORAS after
release qualification. Staging a dashboard image alone does not promote a release.
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
this workflow; the Radius finalizer writes channel aliases instead. An existing
conflicting release requires investigation, not deletion or an automatic overwrite.
The independently published `main`/`latest` path remains unchanged.

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

**Run offline release image regressions:**

```bash
yarn run test:release-images
```

This suite is also part of `yarn run test:all`, which CI runs for pull requests and
release tags. It requires Node.js 24, Git, and Python, but no installed dependencies,
Docker daemon, registry credentials, or network access. To run without Yarn:

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
