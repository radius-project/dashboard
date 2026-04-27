---
description: Coding guidelines and instructions for GitHub Copilot in the Radius Dashboard project
---

# GitHub Copilot Instructions

This file defines **HOW** Copilot should process user queries and the conventions to follow when working on this codebase.

## Project Overview

Radius Dashboard is a [Backstage](https://backstage.io/)-based frontend for the [Radius](https://radapp.io/) cloud-native application platform. It is built as a monorepo using Yarn workspaces with multiple packages and plugins.

For workspace structure and package descriptions, consult `docs/contributing/contributing-code/contributing-code-organization/README.md`.

## Essential Commands

For the full command reference, prerequisites, and troubleshooting, consult `docs/contributing/contributing-code/contributing-code-building/README.md`.

For local development workflow and configuration details, consult `docs/contributing/contributing-code/contributing-code-developing/README.md`.

The most commonly needed commands are:

```bash
yarn install          # Install dependencies (run first in a fresh environment)
yarn dev              # Start frontend + backend concurrently (also run kubectl proxy in a separate terminal)
yarn tsc              # Type checking
yarn lint:all         # Lint all files
yarn test:all         # Run tests with coverage
yarn format:write     # Auto-format code with Prettier
```

Always run `yarn tsc` and `yarn lint:all` before committing changes.

## Coding Conventions

### TypeScript

- All source code is written in **TypeScript**. Do not use plain JavaScript for new source files.
- The project extends the Backstage CLI TypeScript config (`@backstage/cli/config/tsconfig.json`). Follow the compiler settings defined there.
- Use `skipLibCheck: true` for faster builds; run `yarn tsc:full` for thorough type checking.

### Formatting and Linting

- **Prettier** is the formatter. The active formatting settings are defined in `.prettierrc`, including a `printWidth` of **160** and `tabWidth` of **2**.
- **ESLint** is configured with TypeScript and React plugins. Follow the rules defined in the root `.eslintrc.json` and any additional package-level ESLint configs in workspaces where applicable.
- Use `yarn fix` to auto-fix linting issues and `yarn format:write` to auto-format.

### File and Code Style

- Use **2 spaces** for indentation (enforced by `.editorconfig`).
- Use **LF** line endings.
- Ensure files end with a newline.
- Trim trailing whitespace.

### React Components

- Use **functional components** with hooks (not class components).
- Use Material-UI v4 components and styling patterns (e.g., `makeStyles`, `useTheme`).
- Follow Backstage component patterns — use `InfoCard`, `Header`, `Page`, `Content`, and other Backstage layout components where appropriate.

### Plugin Architecture

- The Radius functionality is split into **frontend and backend plugins** that integrate with Backstage's plugin system.
- Frontend plugins define routable extensions via `createRoutableExtension` and use lazy imports for page components.
- Backend plugins use `createBackendPlugin` from `@backstage/backend-plugin-api` and register routes via `httpRouter`.
- The frontend communicates with the Radius API through the Backstage Kubernetes plugin proxy (`@backstage/plugin-kubernetes`).
- The `rad-components` package provides reusable UI components that can be used across different contexts beyond just Backstage.

### Imports

- Use barrel exports (`index.ts`) for public APIs of packages and plugins.
- Use relative imports within a package/plugin; use package names for cross-package imports.

### Testing Conventions

- Prefer colocated `.test.ts` or `.test.tsx` files alongside source files. Some packages (e.g., `rad-components`) use `__test__/` directories.
- **E2E tests** use Playwright. Configuration is in `playwright.config.ts` at the repo root.

## Contributing

- Follow the [Developer Certificate of Origin](https://developercertificate.org/). Sign off commits with `git commit -s`.
- Start by [choosing an existing issue](https://github.com/radius-project/dashboard/issues) or opening a new one before submitting code changes.
- See [CONTRIBUTING.md](../CONTRIBUTING.md) for full contributor documentation.

## CI Pipeline

When running as the Copilot coding agent on GitHub, monitor the CI pipeline results after pushing changes. Check the status of the `Build` workflow (`.github/workflows/build.yaml`) and any other checks on the pull request. If CI fails, read the job logs, diagnose the failure, and push a fix — do not leave a PR with failing CI.

## Temporary Planning Files

Copilot can create temporary planning files in the `.copilot-tracking/` folder at the root of the repository. This folder should be included in `.gitignore` and will not be committed to the repository. Use this folder for:

- Tracking progress on multi-step tasks
- Creating temporary notes or outlines
- Storing intermediate planning documents

Files in this folder can be safely deleted at any time.
