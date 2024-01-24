# Understanding the Radius Dashboard repo code organization

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
