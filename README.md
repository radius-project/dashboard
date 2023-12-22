# Radius Dashboard

Frontend experience for Project Radius

## Organization

This repo uses [corepack](https://nodejs.org/api/corepack.html) and [yarn workspaces](https://classic.yarnpkg.com/lang/en/docs/workspaces/).

It is organized as a mono-repo.

## Prerequisites

- Install a modern version of [Node.js](https://nodejs.org/en/download). We use v20.X.X but other versions are ok.
- Enable corepack with `corepack enable`.

You'll also want an environment where you can experiment with Radius.

## Building

**Install dependencies:**

```bash
yarn install
```

**Build all packages:**

```bash
yarn workspaces foreach -A run build
```

**Build a specific package**

```bash
# Substitute rad-components with any package name
yarn workspace rad-components run build
```

## Developing

**Launch Storybook to experiment with rad-components:**

```bash
yarn workspace rad-components run storybook
```

This will launch Storybook at `http://localhost:6006`