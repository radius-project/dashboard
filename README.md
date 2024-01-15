# Radius Dashboard

Frontend experience for Project Radius

## Organization

This repo uses [corepack](https://nodejs.org/api/corepack.html) and [yarn workspaces](https://classic.yarnpkg.com/lang/en/docs/workspaces/).

It is organized as a mono-repo, and contains the following packages.

| Package                            | Path                              | Description                                                                     |
| ---------------------------------- | --------------------------------- | ------------------------------------------------------------------------------- |
| `<root>`                           | `.`                               | The root `package.json` for the repo. Used as the entrypoint for most commands. |
| `@internal/app`                    | `./packages/app`                  | The frontend (React) part of the Dashboard.                                     |
| `@internal/backend`                | `./packages/backend`              | The backend (Node.js) part of the Dashboard.                                    |
| `@radapp.io/rad-components`        | `./packages/rad-components`       | A library of reusable React components for Radius (no dependency on Backstage). |
| `@radapp.io/plugin-radius`         | `./plugins/plugin-radius`         | The Radius frontend (React) plugin for Backstage.                               |
| `@radapp.io/plugin-radius-backend` | `./plugins/plugin-radius-backend` | The Radius backend (Node.js) plugin for Backstage.                              |

### Understanding the organization

Our repo builds three primary outputs:

- The Radius Dashboard: this is a skinned deployment of Backstage with the layout, and set of plugins optimized for Radius.
- The Radius Backstage plugin: our plugin is available standalone (outside of the Dashboard) so users can add our functionality to Backstage.
- The `@radapp.io/rad-components` library: contains reusable UI like the Radius App Graph visualization. This is a separate package so we can use it in other contexts besides Backstage.

The Radius Backstage plugin and `@radapp.io/rad-components` are published to NPM under the `@radapp.io` organization. The `@internal` organization prefix is used with our other packages to avoid conflicts with other public NPM packages.

## Prerequisites

- Install a modern version of [Node.js](https://nodejs.org/en/download). We use v21.X.X but other versions are ok.
- Enable corepack with `corepack enable`.

You'll also want an environment where you can experiment with Radius.

For development, we recommend VS Code. This repo is configured with recommended extensions that can automate parts of the development process when installed.

## Building

**Install dependencies:**

```bash
yarn install
```

**Build all packages:**

```bash
yarn workspaces foreach -A run build:all
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
yarn build:backend --config ../../app-config.yaml --config ../../app-config.dashboard.yaml
yarn build-image
```

The current `Dockerfile` is set up to build the container using state from the repo like the `node_modules/` folder. This is why the set of steps described above is required.

## Scripts

**Run a specific script in a specific package**

```bash
# Substitute rad-components with any package name
# Substitute link with any script name
yarn workspace @radapp.io/rad-components run lint
```

## Developing: Dashboard

**Launch the Dashboard:**

```bash
yarn dev
```

This will launch the Dashboard at `http://localhost:3000`.

### Configuration

The configuration for local development (`yarn dev`) is stored in `app-config.local.yaml`. This file is a set of overrides for development that will be combined with `app-config.yaml`. See the configuration file comments for links to relevant documentation.

This file is checked in but `.gitignored`'d. Feel free to make changes as needed.

The `app-config.dashboard.yaml` configuration is used when deployed as part of a Radius installation.

## Developing: rad-components

**Launch Storybook to experiment with rad-components:**

```bash
yarn workspace @radapp.io/rad-components run storybook
```

This will launch Storybook at `http://localhost:6006`.

## Testing

**Run tests:**

```
yarn run test:all
```

**Run E2E tests:**

```
yarn run test:e2e
```

## Linting

This project is configured to use `eslint` for linting, along with recommended rules for React and TypeScript. This is checked as part of the pull-request process.

**Run the linter manually:**

```
yarn run lint:all
```

## Formatting

This project is configured to use `prettier` for code formatting. This is checked as part of the pull-request process.

**Run the formatter to find violations:**

```
yarn run format:check
```

**Run the formatter to automatically fix violations:**

```
yarn run format:write
```
