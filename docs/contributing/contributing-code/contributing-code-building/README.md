# Building the Radius Dashboard

## Prerequisites

- Install a modern version of [Node.js](https://nodejs.org/en/download). We use v21.X.X but other versions are ok.
- Enable corepack with `corepack enable`.

You'll also want an [environment](https://docs.radapp.io/guides/deploy-apps/environments/overview/) where you can experiment with Radius. This means you need to have a Kubernetes cluster where Radius is installed. The Dashboard interacts with the Radius API to access the data it displays.

For development, we recommend VS Code. This repo is configured with recommended extensions that can automate parts of the development process when installed.

## Troubleshooting

The most common problem with building and developing in the repo is having the wrong version of Node.JS. Check your version with:

```bash
node version
```

Another common problem is having `yarn` installed globally. This can override the version specified in our `package.json`. Check your version with:

```bash
yarn --version
```

This should make the version specified in `package.json` in the `packageManager` field.

## Commom commands

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

**Run E2E tests:**

```bash
yarn run test:e2e
```

### Scripts

**Run a specific script in a specific package**

```bash
# Substitute rad-components with any package name
# Substitute link with any script name
yarn workspace @radapp.io/rad-components run lint
```
