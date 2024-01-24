# Radius Dashboard

Radius Dashboard is the frontend experience for [Radius](https://github.com/radius-project/radius), a cloud-native application platform that enables developers and the platform engineers that support them to collaborate on delivering and managing cloud-native applications that follow organizational best practices for cost, operations and security, by default. Radius is an open-source project that supports deploying applications across private cloud, Microsoft Azure, and Amazon Web Services, with more cloud providers to come.

The Radius Dashboard is built on [Backstage](https://backstage.io/), an open-source platform for building developer portals that provides a rich set of components to accelerate UI development. The Radius Dashboard is a skinned deployment of Backstage that includes a set of plugins that provide the Radius experience. The components that make up the dashboard are built with extensibility in mind so that they can be used in other contexts beyond Backstage in the future.

Key features of the Radius Dashboard currently include:

- _Application graph visualization_: A visualization of the application graph that shows how resources within an application are connected to each other and the underlying infrastructure.
- _Resource overview and details_: Detailed information about resources within Radius, including applications, environments, and infrastructure.
- _Recipes directory_: A listing of all the Radius Recipes available to the user for a given environment.

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

## Getting help

- ❓ **Have a question?** - Visit our [Discord server](https://discord.gg/SRG3ePMKNy) to post your question and we'll get back to you ASAP
- ⚠️ **Found an issue?** - Refer to our [Issues guide](docs/contributing/contributing-issues) for instructions on filing a bug report
- 💡 **Have a proposal?** - Refer to our [Issues guide](docs/contributing/contributing-issues) for instructions on filing a feature request

## Community

We welcome your contributions and suggestions! One of the easiest ways to contribute is to participate in Issue discussions, chat on [Discord server](https://discord.gg/SRG3ePMKNy) or the monthly [community calls](#community-calls). For more information on the community engagement, developer and contributing guidelines and more, head over to the [Radius community repo](https://github.com/radius-project/community).

## Code of conduct

Please refer to our [Radius Community Code of Conduct](https://github.com/radius-project/community/blob/main/CODE-OF-CONDUCT.md)
